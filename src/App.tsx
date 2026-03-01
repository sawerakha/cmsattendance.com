import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  Settings, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock,
  ChevronLeft,
  ChevronRight,
  Trash2
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip 
} from 'recharts';
import { format, startOfWeek, addDays, isSameDay, parseISO, startOfDay } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { ClassRecord, AttendanceRecord, Stats } from './types';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'schedule' | 'history'>('dashboard');
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<Stats>({ 
    overall: { present: 0, absent: 0, total: 0 },
    monthly: { present: 0, absent: 0, total: 0 },
    weekly: { present: 0, absent: 0, total: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [showAddClass, setShowAddClass] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [newClass, setNewClass] = useState({ name: '', date: '', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
  const [viewDate, setViewDate] = useState(new Date());
  const [statsPeriod, setStatsPeriod] = useState({ month: new Date().getMonth(), year: new Date().getFullYear() });
  const [scheduleView, setScheduleView] = useState<'weekly' | 'monthly'>('weekly');
  const [historyFilterClassId, setHistoryFilterClassId] = useState<number | 'all'>('all');

  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, [statsPeriod]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [classesRes, attendanceRes, statsRes] = await Promise.all([
        fetch('/api/classes'),
        fetch('/api/attendance'),
        fetch(`/api/stats?month=${statsPeriod.month}&year=${statsPeriod.year}`)
      ]);
      
      const classesData = await classesRes.json();
      const attendanceData = await attendanceRes.json();
      const statsData = await statsRes.json();

      setClasses(classesData);
      setAttendance(attendanceData);
      setStats(statsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Duplicate check
    const isDuplicate = classes.some(c => 
      c.name.toLowerCase() === newClass.name.toLowerCase() && 
      c.dayOfWeek === newClass.dayOfWeek && 
      c.startTime === newClass.startTime && 
      c.endTime === newClass.endTime &&
      (c.date || '') === (newClass.date || '')
    );

    if (isDuplicate) {
      alert('This class already exists in your schedule.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClass)
      });
      if (!res.ok) throw new Error('Failed to add class');
      setShowAddClass(false);
      setNewClass({ name: '', date: '', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' });
      await fetchData();
    } catch (error) {
      console.error('Error adding class:', error);
      alert('Failed to add class. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/classes/${editingClass.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingClass)
      });
      if (!res.ok) throw new Error('Failed to update class');
      setEditingClass(null);
      await fetchData();
    } catch (error) {
      console.error('Error updating class:', error);
      alert('Failed to update class. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const lines = bulkText.split('\n').filter(line => line.trim());
    const parsedClasses = lines.map(line => {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length < 4) return null;
      
      const [name, dayOrDate, start, end] = parts;
      
      // Check if dayOrDate is a date (YYYY-MM-DD)
      const isDate = /^\d{4}-\d{2}-\d{2}$/.test(dayOrDate);
      let date = '';
      let dayIdx = -1;

      if (isDate) {
        date = dayOrDate;
        dayIdx = parseISO(date).getDay();
      } else {
        dayIdx = DAYS.findIndex(d => d.toLowerCase() === dayOrDate.toLowerCase());
      }

      if (dayIdx === -1 || !name || !start || !end) return null;

      // Duplicate check against existing classes
      const isDuplicate = classes.some(c => 
        c.name.toLowerCase() === name.toLowerCase() && 
        c.dayOfWeek === dayIdx && 
        c.startTime === start && 
        c.endTime === end &&
        (c.date || '') === (date || '')
      );

      if (isDuplicate) return null;

      return { name, date, dayOfWeek: dayIdx, startTime: start, endTime: end };
    }).filter(Boolean);

    if (parsedClasses.length === 0) {
      alert('No new classes to import. (Duplicates or invalid format skipped)');
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/classes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedClasses)
      });
      if (!res.ok) throw new Error('Failed to bulk import');
      setShowBulkImport(false);
      setBulkText('');
      await fetchData();
    } catch (error) {
      console.error('Error bulk importing:', error);
      alert('Failed to import classes. Please check your format.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('DANGER: This will delete ALL classes and ALL attendance records permanently. Are you absolutely sure?')) return;
    if (!confirm('Final confirmation: This action cannot be undone.')) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/classes/all', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to clear data');
      await fetchData();
      alert('All data has been cleared.');
    } catch (error) {
      console.error('Error clearing data:', error);
      alert('Failed to clear data. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClass = async (id: number) => {
    console.log('Attempting to delete class with ID:', id);
    if (!id) {
      console.error('Invalid class ID provided for deletion');
      return;
    }
    if (isSubmitting) {
      console.warn('Delete ignored: already submitting');
      return;
    }
    
    setIsSubmitting(true);
    setDeletingId(null);
    // Optimistic update
    const previousClasses = [...classes];
    const previousAttendance = [...attendance];
    
    console.log('Performing optimistic delete for ID:', id);
    setClasses(prev => prev.filter(c => c.id !== id));
    setAttendance(prev => prev.filter(a => a.classId !== id));
    
    try {
      const res = await fetch(`/api/classes/${id}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete');
      }
      
      console.log('Server confirmed deletion of ID:', id);
      
      // Success! Now refresh stats in background
      try {
        const statsRes = await fetch('/api/stats');
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
      } catch (e) {
        console.warn('Failed to refresh stats after deletion', e);
      }
    } catch (error) {
      console.error('Error deleting class:', error);
      setClasses(previousClasses); // Rollback
      setAttendance(previousAttendance); // Rollback
      alert(`Failed to delete class: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const markAttendance = async (classId: number, date: string, status: 'present' | 'absent') => {
    const existing = getAttendanceForClass(classId, date);
    const isClearing = existing?.status === status;
    
    // Optimistic update
    const previousAttendance = [...attendance];
    if (isClearing) {
      setAttendance(prev => prev.filter(a => !(a.classId === classId && a.date === date)));
    } else {
      const newRecord = { classId, date, status };
      setAttendance(prev => {
        const filtered = prev.filter(a => !(a.classId === classId && a.date === date));
        return [...filtered, newRecord];
      });
    }

    try {
      if (isClearing) {
        await fetch('/api/attendance', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId, date })
        });
      } else {
        await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId, date, status })
        });
      }
      // Refresh stats in background
      const statsRes = await fetch('/api/stats');
      const statsData = await statsRes.json();
      setStats(statsData);
    } catch (error) {
      console.error('Error updating attendance:', error);
      setAttendance(previousAttendance); // Rollback
    }
  };

  const getAttendanceForClass = (classId: number, date: string) => {
    return attendance.find(a => a.classId === classId && a.date === date);
  };

  const renderDashboard = () => {
    const overallData = [
      { name: 'Present', value: stats.overall.present, color: '#10b981' },
      { name: 'Absent', value: stats.overall.absent, color: '#ef4444' }
    ];

    const monthlyData = [
      { name: 'Present', value: stats.monthly.present, color: '#8b5cf6' },
      { name: 'Absent', value: stats.monthly.absent, color: '#f43f5e' }
    ];

    const today = format(new Date(), 'yyyy-MM-dd');
    const todayDay = new Date().getDay();
    const todaysClasses = classes.filter(c => {
      if (c.date) return c.date === today;
      return c.dayOfWeek === todayDay;
    });

    const overallPercent = stats.overall.total > 0 ? Math.round((stats.overall.present / stats.overall.total) * 100) : 0;
    const monthlyPercent = stats.monthly.total > 0 ? Math.round((stats.monthly.present / stats.monthly.total) * 100) : 0;
    const weeklyPercent = stats.weekly.total > 0 ? Math.round((stats.weekly.present / stats.weekly.total) * 100) : 0;

    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    return (
      <div className="space-y-8">
        {/* Stats Period Selector */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white p-4 rounded-2xl border border-black/5 shadow-sm gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Progress Period</h3>
              <p className="text-xs text-gray-500">Select month to view stats</p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <select 
              value={statsPeriod.month}
              onChange={(e) => setStatsPeriod({ ...statsPeriod, month: parseInt(e.target.value) })}
              className="flex-1 sm:flex-none px-3 py-2 bg-gray-50 border border-black/5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {months.map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>
            <select 
              value={statsPeriod.year}
              onChange={(e) => setStatsPeriod({ ...statsPeriod, year: parseInt(e.target.value) })}
              className="flex-1 sm:flex-none px-3 py-2 bg-gray-50 border border-black/5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {[2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Attendance Stats Column */}
          <div className="space-y-6 col-span-full lg:col-span-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Overall Wheel */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-black/5 flex flex-col items-center">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">Total Attendance</h3>
                <div className="h-40 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={overallData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={60}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {overallData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold">{overallPercent}%</span>
                    <span className="text-[8px] text-gray-400 uppercase">Overall</span>
                  </div>
                </div>
                <div className="flex gap-4 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs text-gray-600">{stats.overall.present} Pres</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-xs text-gray-600">{stats.overall.absent} Abs</span>
                  </div>
                </div>
              </div>

              {/* Monthly Wheel */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-black/5 flex flex-col items-center">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4 text-center">{months[statsPeriod.month]} Summary</h3>
                <div className="h-40 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={monthlyData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={60}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {monthlyData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold">{monthlyPercent}%</span>
                    <span className="text-[8px] text-gray-400 uppercase">Monthly</span>
                  </div>
                </div>
                <div className="flex gap-4 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-violet-500" />
                    <span className="text-xs text-gray-600">{stats.monthly.present} Pres</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-rose-500" />
                    <span className="text-xs text-gray-600">{stats.monthly.absent} Abs</span>
                  </div>
                </div>
              </div>

              {/* Weekly Progress */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-black/5 flex flex-col justify-center">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">Weekly Progress</h3>
                <div className="flex items-end gap-3 mb-2">
                  <span className="text-3xl font-bold text-indigo-600">{weeklyPercent}%</span>
                  <span className="text-xs text-gray-500 mb-1">This week</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div 
                    className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" 
                    style={{ width: `${weeklyPercent}%` }} 
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSchedule = () => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const renderWeeklyView = () => (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {DAYS.map((day, idx) => {
          if (idx === 0) return null; // Sunday is off
          const dayClasses = classes.filter(c => c.dayOfWeek === idx);
          return (
            <div key={day} className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-bottom border-black/5">
                <h3 className="font-semibold text-gray-700">{day}</h3>
              </div>
              <div className="p-4 space-y-3">
                {dayClasses.length === 0 ? (
                  <p className="text-sm text-gray-400 italic py-4 text-center">No classes</p>
                ) : (
                  dayClasses.map(c => (
                    <div key={c.id} className="group flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-transparent hover:border-indigo-100 transition-all">
                      <div>
                        <p className="font-medium text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-500">
                          {c.startTime} - {c.endTime}
                          {c.date && <span className="ml-2 text-indigo-600 font-semibold">• {format(parseISO(c.date), 'MMM d')}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-all">
                        {deletingId === c.id ? (
                          <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-100">
                            <span className="text-[10px] font-bold text-red-600 px-1">Delete?</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteClass(c.id); }}
                              className="p-1 text-white bg-red-500 rounded hover:bg-red-600 transition-colors"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                              className="p-1 text-gray-400 bg-white rounded border border-gray-200 hover:bg-gray-50 transition-colors"
                            >
                              <XCircle className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button 
                              disabled={isSubmitting}
                              onClick={(e) => { e.stopPropagation(); setEditingClass(c); }}
                              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30"
                              title="Edit Class"
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                            <button 
                              disabled={isSubmitting}
                              onClick={(e) => { e.stopPropagation(); setDeletingId(c.id); }}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
                              title="Delete Class"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    );

    const renderMonthlyView = () => {
      // Group classes by month
      const monthsWithClasses = Array.from({ length: 12 }, (_, i) => {
        const monthClasses = classes.filter(c => {
          if (c.date) return parseISO(c.date).getMonth() === i;
          return true; // Recurring classes appear in all months
        });
        return { month: months[i], classes: monthClasses, index: i };
      }).filter(m => m.classes.length > 0);

      return (
        <div className="space-y-12">
          {monthsWithClasses.map(m => (
            <div key={m.month} className="space-y-4">
              <div className="flex items-center gap-4">
                <h3 className="text-xl font-bold text-gray-900">{m.month}</h3>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5].map(week => {
                  const weekClasses = m.classes.filter(c => {
                    // This is a simplification: for recurring classes, we show them in every week
                    // For dated classes, we check if they fall in this week of the month
                    if (c.date) {
                      const date = parseISO(c.date);
                      const weekOfMonth = Math.ceil(date.getDate() / 7);
                      return weekOfMonth === week;
                    }
                    return true;
                  });

                  if (weekClasses.length === 0) return null;

                  return (
                    <div key={week} className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm">
                      <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-3">Week {week}</p>
                      <div className="space-y-2">
                        {weekClasses.map(c => (
                          <div key={`${m.month}-${week}-${c.id}`} className="p-2 rounded-lg bg-gray-50 border border-black/5">
                            <p className="text-xs font-semibold text-gray-900">{c.name}</p>
                            <p className="text-[10px] text-gray-500">{DAYS[c.dayOfWeek]} • {c.startTime}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-900">Schedule</h2>
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button 
                onClick={() => setScheduleView('weekly')}
                className={cn(
                  "px-4 py-1.5 text-xs font-medium rounded-lg transition-all",
                  scheduleView === 'weekly' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                By Day
              </button>
              <button 
                onClick={() => setScheduleView('monthly')}
                className={cn(
                  "px-4 py-1.5 text-xs font-medium rounded-lg transition-all",
                  scheduleView === 'monthly' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                By Month
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            <button 
              onClick={handleClearAll}
              disabled={isSubmitting || classes.length === 0}
              className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white text-red-600 border border-red-100 rounded-xl hover:bg-red-50 transition-colors shadow-sm disabled:opacity-50 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Clear All
            </button>
            <button 
              onClick={() => setShowBulkImport(true)}
              disabled={isSubmitting}
              className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white text-gray-700 border border-black/5 rounded-xl hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50 text-sm"
            >
              <Plus className="w-4 h-4" />
              Bulk Add
            </button>
            <button 
              onClick={() => setShowAddClass(true)}
              disabled={isSubmitting}
              className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50 text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Class
            </button>
          </div>
        </div>

        {scheduleView === 'weekly' ? renderWeeklyView() : renderMonthlyView()}

        <AnimatePresence>
          {showBulkImport && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold">Bulk Import Classes</h3>
                  <button onClick={() => setShowBulkImport(false)} className="text-gray-400 hover:text-gray-600">
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Enter classes one per line in the format: <br/>
                  <code className="bg-gray-100 px-2 py-1 rounded text-indigo-600">Class Name, Date (YYYY-MM-DD) or Day, Start Time, End Time</code>
                </p>
                <div className="bg-indigo-50 p-4 rounded-xl mb-6">
                  <p className="text-xs font-semibold text-indigo-600 uppercase mb-2">Example:</p>
                  <pre className="text-xs text-indigo-800">
                    Mathematics, 2026-03-02, 09:00, 10:00{"\n"}
                    Physics, Tuesday, 11:00, 12:30{"\n"}
                    Chemistry, Wednesday, 14:00, 15:00
                  </pre>
                </div>
                <form onSubmit={handleBulkImport} className="space-y-4">
                  <textarea
                    required
                    rows={10}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono text-sm"
                    placeholder="Mathematics, Monday, 09:00, 10:00"
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                  />
                  <div className="flex gap-3 pt-4">
                    <button 
                      type="button"
                      onClick={() => setShowBulkImport(false)}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                      Import All
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}

          {showAddClass && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-8 w-full max-md shadow-2xl"
              >
                <h3 className="text-xl font-bold mb-6">Add New Class</h3>
                <form onSubmit={handleAddClass} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class Name</label>
                    <input 
                      required
                      type="text"
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      value={newClass.name}
                      onChange={e => setNewClass({...newClass, name: e.target.value})}
                      placeholder="e.g. Mathematics"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date (Optional for recurring)</label>
                    <input 
                      type="date"
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      value={newClass.date}
                      onChange={e => {
                        const date = e.target.value;
                        const dayOfWeek = date ? parseISO(date).getDay() : newClass.dayOfWeek;
                        setNewClass({...newClass, date, dayOfWeek});
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
                    <select 
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      value={newClass.dayOfWeek}
                      onChange={e => setNewClass({...newClass, dayOfWeek: parseInt(e.target.value)})}
                    >
                      {DAYS.map((day, idx) => {
                        if (idx === 0) return null;
                        return <option key={day} value={idx}>{day}</option>;
                      })}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                      <input 
                        required
                        type="time"
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                        value={newClass.startTime}
                        onChange={e => setNewClass({...newClass, startTime: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                      <input 
                        required
                        type="time"
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                        value={newClass.endTime}
                        onChange={e => setNewClass({...newClass, endTime: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button 
                      type="button"
                      onClick={() => setShowAddClass(false)}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                      Save Class
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}

          {editingClass && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
              >
                <h3 className="text-xl font-bold mb-6">Edit Class</h3>
                <form onSubmit={handleUpdateClass} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class Name</label>
                    <input 
                      required
                      type="text"
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      value={editingClass.name}
                      onChange={e => setEditingClass({...editingClass, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date (Optional)</label>
                    <input 
                      type="date"
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      value={editingClass.date || ''}
                      onChange={e => {
                        const date = e.target.value;
                        const dayOfWeek = date ? parseISO(date).getDay() : editingClass.dayOfWeek;
                        setEditingClass({...editingClass, date, dayOfWeek});
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
                    <select 
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      value={editingClass.dayOfWeek}
                      onChange={e => setEditingClass({...editingClass, dayOfWeek: parseInt(e.target.value)})}
                    >
                      {DAYS.map((day, idx) => {
                        if (idx === 0) return null;
                        return <option key={day} value={idx}>{day}</option>;
                      })}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                      <input 
                        required
                        type="time"
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                        value={editingClass.startTime}
                        onChange={e => setEditingClass({...editingClass, startTime: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                      <input 
                        required
                        type="time"
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                        value={editingClass.endTime}
                        onChange={e => setEditingClass({...editingClass, endTime: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button 
                      type="button"
                      onClick={() => setEditingClass(null)}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                      Update Class
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderHistory = () => {
    const weekStart = startOfWeek(viewDate, { weekStartsOn: 1 }); // Start on Monday
    const weekDays = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i)); // 6 days (Mon-Sat)

    // Only show classes that are either recurring OR scheduled for this specific week
    const relevantClasses = classes.filter(c => {
      if (historyFilterClassId !== 'all' && c.id !== historyFilterClassId) return false;
      if (!c.date) return c.dayOfWeek !== 0; // Exclude Sunday recurring
      const classDate = parseISO(c.date);
      return classDate >= weekStart && classDate <= weekDays[5] && classDate.getDay() !== 0;
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Attendance History</h2>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
            <select
              value={historyFilterClassId}
              onChange={(e) => setHistoryFilterClassId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              className="px-3 py-2 bg-white text-sm font-medium text-gray-600 border border-black/5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            >
              <option value="all">All Classes</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.startTime})</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setViewDate(new Date())}
                className="flex-1 sm:flex-none px-3 py-2 bg-white text-sm font-medium text-gray-600 border border-black/5 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
              >
                Today
              </button>
              <div className="flex-1 sm:flex-none flex items-center justify-between gap-4 bg-white p-2 rounded-xl border border-black/5 shadow-sm">
                <button onClick={() => setViewDate(addDays(viewDate, -7))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-medium min-w-[120px] md:min-w-[160px] text-center text-xs md:text-sm">
                  {format(weekStart, 'MMM d')} - {format(weekDays[5], 'MMM d, yyyy')}
                </span>
                <button onClick={() => setViewDate(addDays(viewDate, 7))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-black/5">
                  <th className="p-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50/50 z-10">Class</th>
                  {weekDays.map(day => (
                    <th key={day.toString()} className="p-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider min-w-[100px]">
                      <span className={cn(
                        "block mb-1",
                        isSameDay(day, new Date()) ? "text-indigo-600 font-bold" : "text-gray-400"
                      )}>
                        {format(day, 'EEE')}
                      </span>
                      <span className={cn(
                        "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm",
                        isSameDay(day, new Date()) ? "bg-indigo-600 text-white font-bold" : "text-gray-900"
                      )}>
                        {format(day, 'd')}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {relevantClasses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-20 text-center text-gray-400">
                      <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-10" />
                      <p className="text-sm">No classes scheduled for this week</p>
                    </td>
                  </tr>
                ) : (
                  relevantClasses.map(c => (
                    <tr key={c.id} className="border-b border-black/5 last:border-0 hover:bg-gray-50/30 transition-colors group">
                      <td className="p-4 sticky left-0 bg-white group-hover:bg-gray-50/30 z-10 border-r border-black/5">
                        <p className="font-semibold text-gray-900 truncate max-w-[150px]">{c.name}</p>
                        <p className="text-[10px] text-gray-500 font-mono uppercase tracking-tighter">{c.startTime} - {c.endTime}</p>
                      </td>
                      {weekDays.map(day => {
                        const dayIdx = day.getDay();
                        const dateStr = format(day, 'yyyy-MM-dd');
                        
                        // Find if THIS specific class (c) is scheduled for THIS day
                        const isThisClassScheduled = c.date ? c.date === dateStr : c.dayOfWeek === dayIdx;

                        const record = getAttendanceForClass(c.id, dateStr);
                        const isFuture = startOfDay(day) > startOfDay(new Date());

                        if (!isThisClassScheduled) return <td key={day.toString()} className="p-4 bg-gray-50/20" />;

                        return (
                          <td key={day.toString()} className="p-4 text-center">
                            <div className="flex justify-center gap-1.5">
                              <button
                                disabled={isFuture}
                                onClick={() => markAttendance(c.id, dateStr, 'present')}
                                className={cn(
                                  "p-2 rounded-lg transition-all transform active:scale-95",
                                  record?.status === 'present' 
                                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-100" 
                                    : "bg-gray-100 text-gray-300 hover:bg-emerald-50 hover:text-emerald-500",
                                  isFuture && "opacity-20 cursor-not-allowed"
                                )}
                                title="Mark Present"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button
                                disabled={isFuture}
                                onClick={() => markAttendance(c.id, dateStr, 'absent')}
                                className={cn(
                                  "p-2 rounded-lg transition-all transform active:scale-95",
                                  record?.status === 'absent' 
                                    ? "bg-red-500 text-white shadow-md shadow-red-100" 
                                    : "bg-gray-100 text-gray-300 hover:bg-red-50 hover:text-red-500",
                                  isFuture && "opacity-20 cursor-not-allowed"
                                )}
                                title="Mark Absent"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-gray-400 text-center italic">
          Tip: You can navigate through weeks to mark attendance for past classes. Future classes are locked.
        </p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col md:flex-row">
      {/* Sidebar (Desktop) / Bottom Nav (Mobile) */}
      <aside className="hidden md:flex w-64 bg-white border-r border-black/5 flex-col sticky top-0 h-screen">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-gray-900">TrackCMS</h1>
          </div>
          
          <nav className="space-y-1">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                activeTab === 'dashboard' ? "bg-indigo-50 text-indigo-600 font-medium" : "text-gray-500 hover:bg-gray-50"
              )}
            >
              <LayoutDashboard className="w-5 h-5" />
              Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('schedule')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                activeTab === 'schedule' ? "bg-indigo-50 text-indigo-600 font-medium" : "text-gray-500 hover:bg-gray-50"
              )}
            >
              <Settings className="w-5 h-5" />
              Schedule
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                activeTab === 'history' ? "bg-indigo-50 text-indigo-600 font-medium" : "text-gray-500 hover:bg-gray-50"
              )}
            >
              <CalendarIcon className="w-5 h-5" />
              History
            </button>
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-black/5">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Session Progress</p>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
              <div 
                className="bg-indigo-600 h-1.5 rounded-full transition-all duration-1000" 
                style={{ 
                  width: `${Math.min(100, Math.max(0, ((new Date().getTime() - new Date('2026-01-01').getTime()) / (365 * 24 * 60 * 60 * 1000)) * 100))}%` 
                }} 
              />
            </div>
            <p className="text-[10px] text-gray-500">Started Jan 2026 • 1 year duration</p>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-black/5 px-6 py-3 flex justify-between items-center z-50 pb-safe">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            "flex flex-col items-center gap-1",
            activeTab === 'dashboard' ? "text-indigo-600" : "text-gray-400"
          )}
        >
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-[10px] font-medium">Home</span>
        </button>
        <button 
          onClick={() => setActiveTab('schedule')}
          className={cn(
            "flex flex-col items-center gap-1",
            activeTab === 'schedule' ? "text-indigo-600" : "text-gray-400"
          )}
        >
          <Settings className="w-6 h-6" />
          <span className="text-[10px] font-medium">Schedule</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={cn(
            "flex flex-col items-center gap-1",
            activeTab === 'history' ? "text-indigo-600" : "text-gray-400"
          )}
        >
          <CalendarIcon className="w-6 h-6" />
          <span className="text-[10px] font-medium">History</span>
        </button>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto pb-24 md:pb-8">
        <header className="mb-6 md:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              {activeTab === 'dashboard' ? 'Welcome back!' : 
               activeTab === 'schedule' ? 'Manage Classes' : 'Attendance History'}
            </h2>
            <p className="text-sm text-gray-500">Track your academic journey effortlessly.</p>
          </div>
          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-black/5 shadow-sm sm:shadow-none sm:border-none sm:bg-transparent">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">Leather Zombie</p>
              <p className="text-[10px] text-gray-500">leatherzombiek@gmail.com</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 border-2 border-white shadow-sm" />
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'dashboard' && renderDashboard()}
            {activeTab === 'schedule' && renderSchedule()}
            {activeTab === 'history' && renderHistory()}
          </motion.div>
        )}
      </main>
    </div>
  );
}
