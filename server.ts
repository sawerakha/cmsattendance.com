import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("attendance.db");
db.pragma('foreign_keys = ON');

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT,
    dayOfWeek INTEGER NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    classId INTEGER NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    UNIQUE(classId, date),
    FOREIGN KEY (classId) REFERENCES classes(id) ON DELETE CASCADE
  );
`);

// Migration: Add date column if it doesn't exist
try {
  db.prepare("ALTER TABLE classes ADD COLUMN date TEXT").run();
} catch (e) {
  // Column already exists or other error
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/classes", (req, res) => {
    const classes = db.prepare("SELECT * FROM classes ORDER BY date, dayOfWeek, startTime").all();
    res.json(classes);
  });

  app.post("/api/classes", (req, res) => {
    try {
      const { name, date, dayOfWeek, startTime, endTime } = req.body;
      const info = db.prepare("INSERT INTO classes (name, date, dayOfWeek, startTime, endTime) VALUES (?, ?, ?, ?, ?)").run(name, date, dayOfWeek, startTime, endTime);
      const newId = Number(info.lastInsertRowid);
      console.log(`Created new class with ID: ${newId}`);
      res.json({ id: newId });
    } catch (error) {
      console.error("Error creating class:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/classes/:id", (req, res) => {
    const { name, date, dayOfWeek, startTime, endTime } = req.body;
    db.prepare("UPDATE classes SET name = ?, date = ?, dayOfWeek = ?, startTime = ?, endTime = ? WHERE id = ?").run(name, date, dayOfWeek, startTime, endTime, req.params.id);
    res.json({ success: true });
  });

  app.post("/api/classes/bulk", (req, res) => {
    const classes = req.body; // Array of { name, date, dayOfWeek, startTime, endTime }
    const insert = db.prepare("INSERT INTO classes (name, date, dayOfWeek, startTime, endTime) VALUES (?, ?, ?, ?, ?)");
    
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        insert.run(item.name, item.date, item.dayOfWeek, item.startTime, item.endTime);
      }
    });

    insertMany(classes);
    res.json({ success: true, count: classes.length });
  });

  app.delete("/api/classes/all", (req, res) => {
    try {
      db.prepare("DELETE FROM attendance").run();
      db.prepare("DELETE FROM classes").run();
      console.log("Successfully cleared all classes and attendance");
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing data:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/classes/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const info = db.prepare("DELETE FROM classes WHERE id = ?").run(id);
      if (info.changes === 0) {
        console.log(`Delete failed: Class with ID ${id} not found`);
        return res.status(404).json({ error: "Class not found" });
      }
      console.log(`Successfully deleted class with ID ${id}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting class:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/attendance", (req, res) => {
    const records = db.prepare(`
      SELECT a.*, c.name as className 
      FROM attendance a 
      JOIN classes c ON a.classId = c.id
      ORDER BY a.date DESC
    `).all();
    res.json(records);
  });

  app.post("/api/attendance", (req, res) => {
    const { classId, date, status } = req.body;
    db.prepare(`
      INSERT INTO attendance (classId, date, status) 
      VALUES (?, ?, ?)
      ON CONFLICT(classId, date) DO UPDATE SET status = excluded.status
    `).run(classId, date, status);
    res.json({ success: true });
  });

  app.delete("/api/attendance", (req, res) => {
    const { classId, date } = req.body;
    db.prepare("DELETE FROM attendance WHERE classId = ? AND date = ?").run(classId, date);
    res.json({ success: true });
  });

  app.get("/api/stats", (req, res) => {
    const month = req.query.month ? parseInt(req.query.month as string) : new Date().getMonth();
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    
    const firstDayOfMonth = new Date(year, month, 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(year, month + 1, 0).toISOString().split('T')[0];
    
    // Get start of current week (Sunday) for the selected date or today
    const now = new Date();
    const anchorDate = (month === now.getMonth() && year === now.getFullYear()) ? now : new Date(year, month, 1);
    const day = anchorDate.getDay();
    const diff = anchorDate.getDate() - day;
    const startOfWeek = new Date(new Date(anchorDate).setDate(diff)).toISOString().split('T')[0];
    const endOfWeek = new Date(new Date(anchorDate).setDate(diff + 6)).toISOString().split('T')[0];

    const stats = db.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as overall_present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as overall_absent,
        SUM(CASE WHEN date >= ? AND date <= ? AND status = 'present' THEN 1 ELSE 0 END) as monthly_present,
        SUM(CASE WHEN date >= ? AND date <= ? AND status = 'absent' THEN 1 ELSE 0 END) as monthly_absent,
        SUM(CASE WHEN date >= ? AND date <= ? AND status = 'present' THEN 1 ELSE 0 END) as weekly_present,
        SUM(CASE WHEN date >= ? AND date <= ? AND status = 'absent' THEN 1 ELSE 0 END) as weekly_absent
      FROM attendance
    `).get(firstDayOfMonth, lastDayOfMonth, firstDayOfMonth, lastDayOfMonth, startOfWeek, endOfWeek, startOfWeek, endOfWeek) as any;
    
    res.json({
      overall: {
        present: stats.overall_present || 0,
        absent: stats.overall_absent || 0,
        total: (stats.overall_present || 0) + (stats.overall_absent || 0)
      },
      monthly: {
        present: stats.monthly_present || 0,
        absent: stats.monthly_absent || 0,
        total: (stats.monthly_present || 0) + (stats.monthly_absent || 0)
      },
      weekly: {
        present: stats.weekly_present || 0,
        absent: stats.weekly_absent || 0,
        total: (stats.weekly_present || 0) + (stats.weekly_absent || 0)
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
