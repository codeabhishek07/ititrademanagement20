import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Edit2, Trash2, Check, X, BookOpen, Clock } from 'lucide-react';
import { WeeklyPlan, Trade } from '../../types.ts';
import { fetchWeeklyPlans, saveWeeklyPlan, deleteWeeklyPlan } from '../../api.ts';

interface WeeklyPlanManagerProps {
  tradeId: string;
  tradeName: string;
  officerName: string;
}

export const WeeklyPlanManager: React.FC<WeeklyPlanManagerProps> = ({ tradeId, tradeName, officerName }) => {
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WeeklyPlan | null>(null);
  const [toast, setToast] = useState('');

  const [form, setForm] = useState({
    weekNumber: 1,
    dateRange: '03 Nov 2025 - 08 Nov 2025',
    summaryTheoryDone: 5,
    summaryTheoryPlanned: 5,
    summaryPracticalDone: 15,
    summaryPracticalPlanned: 15,
    dailyBreakdown: [
      { day: 'Monday', date: '03 Nov', theoryTopic: 'Safety Precautions & PPE', practicalTopic: 'Bench Vice Identification', status: 'Completed' as const },
      { day: 'Tuesday', date: '04 Nov', theoryTopic: 'Hand Tools Classification', practicalTopic: 'Filing & Hacksawing Practice', status: 'Completed' as const },
      { day: 'Wednesday', date: '05 Nov', theoryTopic: 'Marking Tools & Calipers', practicalTopic: 'Try Square & Vernier Caliper Calibration', status: 'Completed' as const },
      { day: 'Thursday', date: '06 Nov', theoryTopic: 'Drilling Machines & Bits', practicalTopic: 'Drilling & Tapping Practice', status: 'Pending' as const },
      { day: 'Friday', date: '07 Nov', theoryTopic: 'Sheet Metal Joints', practicalTopic: 'Sheet Metal Soldering & Riveting', status: 'Pending' as const },
      { day: 'Saturday', date: '08 Nov', theoryTopic: 'Weekly Revision & Test', practicalTopic: 'Workshop Cleanup & Maintenance', status: 'Pending' as const },
    ],
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadPlans = async () => {
    if (!tradeId) return;
    setLoading(true);
    try {
      const data = await fetchWeeklyPlans(tradeId);
      setPlans(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, [tradeId]);

  const handleOpenModal = (p?: WeeklyPlan) => {
    if (p) {
      setEditingPlan(p);
      setForm({
        weekNumber: p.weekNumber,
        dateRange: p.dateRange,
        summaryTheoryDone: p.summaryTheoryDone,
        summaryTheoryPlanned: p.summaryTheoryPlanned,
        summaryPracticalDone: p.summaryPracticalDone,
        summaryPracticalPlanned: p.summaryPracticalPlanned,
        dailyBreakdown: p.dailyBreakdown || [],
      });
    } else {
      setEditingPlan(null);
      setForm({
        weekNumber: plans.length + 1,
        dateRange: 'Current Week',
        summaryTheoryDone: 0,
        summaryTheoryPlanned: 5,
        summaryPracticalDone: 0,
        summaryPracticalPlanned: 15,
        dailyBreakdown: [
          { day: 'Monday', date: '', theoryTopic: 'Theory Topic 1', practicalTopic: 'Practical 1', status: 'Pending' },
          { day: 'Tuesday', date: '', theoryTopic: 'Theory Topic 2', practicalTopic: 'Practical 2', status: 'Pending' },
          { day: 'Wednesday', date: '', theoryTopic: 'Theory Topic 3', practicalTopic: 'Practical 3', status: 'Pending' },
          { day: 'Thursday', date: '', theoryTopic: 'Theory Topic 4', practicalTopic: 'Practical 4', status: 'Pending' },
          { day: 'Friday', date: '', theoryTopic: 'Theory Topic 5', practicalTopic: 'Practical 5', status: 'Pending' },
          { day: 'Saturday', date: '', theoryTopic: 'Revision / Test', practicalTopic: 'Workshop Cleaning', status: 'Pending' },
        ],
      });
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveWeeklyPlan({
        id: editingPlan?.id,
        tradeId,
        officerName,
        ...form,
      });
      showToast(editingPlan ? 'Weekly plan updated' : 'Weekly plan created');
      setModalOpen(false);
      loadPlans();
    } catch (err: any) {
      alert(err.message || 'Failed to save weekly plan');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this weekly teaching plan?')) return;
    try {
      await deleteWeeklyPlan(id);
      showToast('Weekly plan deleted');
      loadPlans();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
              <Calendar className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Weekly Teaching Plan (साप्ताहिक शिक्षण योजना)</h3>
              <p className="text-xs text-slate-500">
                Micro-planning view outlining theory and practical topics from Monday to Saturday for {tradeName}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleOpenModal()}
          className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Weekly Plan</span>
        </button>
      </div>

      {/* Weekly Plan List */}
      <div className="space-y-4">
        {plans.map((wp) => (
          <div key={wp.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4 hover:border-emerald-300 transition-all">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-emerald-700 text-white text-xs font-bold rounded-lg font-mono">
                    Week {wp.weekNumber}
                  </span>
                  <h4 className="font-bold text-slate-900 text-sm">{wp.dateRange}</h4>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <span className="px-2.5 py-1 bg-slate-100 rounded-md font-mono text-slate-700">
                  Theory: <strong>{wp.summaryTheoryDone}</strong> / {wp.summaryTheoryPlanned} hrs
                </span>
                <span className="px-2.5 py-1 bg-slate-100 rounded-md font-mono text-slate-700">
                  Practical: <strong>{wp.summaryPracticalDone}</strong> / {wp.summaryPracticalPlanned} hrs
                </span>
                <div className="flex gap-2 ml-2">
                  <button onClick={() => handleOpenModal(wp)} className="p-1 text-slate-600 hover:text-emerald-700 cursor-pointer" title="Edit">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(wp.id)} className="p-1 text-slate-600 hover:text-rose-600 cursor-pointer" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Daily Breakdown Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                    <th className="p-2.5 font-bold w-28">Day</th>
                    <th className="p-2.5 font-bold w-24">Date</th>
                    <th className="p-2.5 font-bold">Theory Topic</th>
                    <th className="p-2.5 font-bold">Practical Topic</th>
                    <th className="p-2.5 font-bold w-24 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(wp.dailyBreakdown || []).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60">
                      <td className="p-2.5 font-semibold text-slate-900">{row.day}</td>
                      <td className="p-2.5 font-mono text-slate-500">{row.date || '—'}</td>
                      <td className="p-2.5 text-slate-700">{row.theoryTopic}</td>
                      <td className="p-2.5 text-slate-700 font-medium">{row.practicalTopic}</td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            row.status === 'Completed'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-[11px] text-slate-500 flex justify-between pt-2 border-t border-slate-100">
              <span>Instructor: <strong className="text-slate-800">{wp.officerName}</strong></span>
              <span>Govt ITI Raigarh (C.G.)</span>
            </div>
          </div>
        ))}

        {plans.length === 0 && !loading && (
          <div className="py-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
            <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium">No weekly teaching plans created yet.</p>
            <p className="text-xs text-slate-400 mt-1">Click "Add Weekly Plan" to outline weekly theory & practical topics.</p>
          </div>
        )}
      </div>

      {/* MODAL: CREATE / EDIT WEEKLY PLAN */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 text-xs text-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                {editingPlan ? 'Edit Weekly Teaching Plan' : 'Create Weekly Teaching Plan'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Week Number</label>
                  <input
                    type="number"
                    value={form.weekNumber}
                    onChange={(e) => setForm({ ...form, weekNumber: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Date Range (e.g. 03 Nov - 08 Nov)</label>
                  <input
                    type="text"
                    value={form.dateRange}
                    onChange={(e) => setForm({ ...form, dateRange: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    required
                  />
                </div>
              </div>

              {/* Daily Breakdown Inputs */}
              <div>
                <label className="block font-semibold mb-2 text-slate-700">Daily Breakdown (Monday to Saturday)</label>
                <div className="space-y-2">
                  {form.dailyBreakdown.map((row, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200 items-center">
                      <div className="col-span-2 font-bold text-slate-900">{row.day}</div>
                      <div className="col-span-2">
                        <input
                          type="text"
                          placeholder="Date"
                          value={row.date}
                          onChange={(e) => {
                            const updated = [...form.dailyBreakdown];
                            updated[index].date = e.target.value;
                            setForm({ ...form, dailyBreakdown: updated });
                          }}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="text"
                          placeholder="Theory Topic"
                          value={row.theoryTopic}
                          onChange={(e) => {
                            const updated = [...form.dailyBreakdown];
                            updated[index].theoryTopic = e.target.value;
                            setForm({ ...form, dailyBreakdown: updated });
                          }}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="text"
                          placeholder="Practical Topic"
                          value={row.practicalTopic}
                          onChange={(e) => {
                            const updated = [...form.dailyBreakdown];
                            updated[index].practicalTopic = e.target.value;
                            setForm({ ...form, dailyBreakdown: updated });
                          }}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                        />
                      </div>
                      <div className="col-span-2">
                        <select
                          value={row.status}
                          onChange={(e) => {
                            const updated = [...form.dailyBreakdown];
                            updated[index].status = e.target.value as any;
                            setForm({ ...form, dailyBreakdown: updated });
                          }}
                          className="w-full px-1 py-1 border border-slate-300 rounded text-[11px] font-semibold"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Weekly Plan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
