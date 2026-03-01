export interface ClassRecord {
  id: number;
  name: string;
  date?: string; // YYYY-MM-DD
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface AttendanceRecord {
  id: number;
  classId: number;
  className: string;
  date: string;
  status: 'present' | 'absent';
}

export interface Stats {
  overall: { present: number; absent: number; total: number };
  monthly: { present: number; absent: number; total: number };
  weekly: { present: number; absent: number; total: number };
}
