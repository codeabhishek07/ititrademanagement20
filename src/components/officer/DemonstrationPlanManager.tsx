import React, { useState, useEffect } from 'react';
import { Wrench, Plus, Edit2, Trash2, Check, X, Calendar, Clock } from 'lucide-react';
import { DemonstrationPlan, Trade } from '../../types.ts';
import { fetchDemonstrationPlans, saveDemonstrationPlan, deleteDemonstrationPlan } from '../../api.ts';

interface DemonstrationPlanManagerProps {
  tradeId: string;
  tradeName: string;
  officerName: string;
}

export const DemonstrationPlanManager: React.FC<DemonstrationPlanManagerProps> = ({ tradeId, tradeName, officerName }) => {
  const [plans, setPlans] = useState<DemonstrationPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<DemonstrationPlan | null>(null);
  const [toast, setToast] = useState('');

  const [form, setForm] = useState({
    practicalTitle: 'Practical Demo 1: Bench Vice Filing & Hack-sawing',
    toolsRequired: 'Bench Vice, Flat File 10-inch, Hacksaw frame with blade, Try Square, Vernier Caliper',
    allottedHours: 8,
    targetDate: new Date().toISOString().split('T')[0],
    status: 'Pending' as 'Pending' | 'Completed',
    objectives: 'To train apprentices on accurate filing to flat surface within 0.2mm tolerance.',
    procedureSteps: [
      'Inspect workpiece and mark dimensions with surface plate and scriber.',
      'Secure metal piece firmly in bench vice using soft jaws.',
      'Perform cross-filing maintaining correct posture and body weight.',
      'Check flatness with try square and vernier caliper.',
    ],
    hints: 'Ensure proper stance and consistent hand pressure during stroke.',
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadPlans = async () => {
    if (!tradeId) return;
    setLoading(true);
    try {
      const data = await fetchDemonstrationPlans(tradeId);
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

  const handleOpenModal = (p?: DemonstrationPlan) => {
    if (p) {
      setEditingPlan(p);
      setForm({
        practicalTitle: p.practicalTitle,
        toolsRequired: p.toolsRequired,
        allottedHours: p.allottedHours,
        targetDate: p.targetDate,
        status: p.status,
        objectives: p.objectives,
        procedureSteps: p.procedureSteps,
        hints: p.hints,
      });
    } else {
      setEditingPlan(null);
      setForm({
        practicalTitle: 'Workshop Practical Demonstration',
        toolsRequired: 'Standard workshop hand tools & safety equipment',
        allottedHours: 6,
        targetDate: new Date().toISOString().split('T')[0],
        status: 'Pending',
        objectives: 'To execute practical skill under instructor guidance.',
        procedureSteps: ['Preparation of workshop station', 'Step by step execution', 'Inspection & measurement'],
        hints: 'Follow all safety norms.',
      });
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveDemonstrationPlan({
        id: editingPlan?.id,
        tradeId,
        officerName,
        ...form,
      });
      showToast(editingPlan ? 'Demonstration plan updated' : 'Demonstration plan scheduled');
      setModalOpen(false);
      loadPlans();
    } catch (err: any) {
      alert(err.message || 'Failed to save demonstration plan');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this practical demonstration plan?')) return;
    try {
      await deleteDemonstrationPlan(id);
      showToast('Demonstration plan deleted');
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
              <Wrench className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Demonstration Plan Scheduler (प्रदर्शन योजना अनुसूचक)</h3>
              <p className="text-xs text-slate-500">
                Manage practical workshop demonstrations, tools, hours, and step procedures for {tradeName}
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
          <span>Schedule Practical Demo</span>
        </button>
      </div>

      {/* Demonstration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map((dp) => (
          <div key={dp.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3 relative hover:border-emerald-300 transition-all">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-bold text-slate-900 text-sm">{dp.practicalTitle}</h4>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                  dp.status === 'Completed'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {dp.status}
              </span>
            </div>

            <div className="text-xs text-slate-600 space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-slate-700 font-mono">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  {dp.allottedHours} Learning Hours
                </span>
                <span className="text-slate-400">·</span>
                <span className="flex items-center gap-1 text-slate-700 font-mono">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                  Target: {dp.targetDate}
                </span>
              </div>

              <div>
                <span className="font-semibold text-slate-700">Tools / Equipment Required:</span>
                <p className="font-mono text-[11px] text-slate-800 bg-slate-50 p-2 rounded border border-slate-100 mt-0.5">
                  {dp.toolsRequired}
                </p>
              </div>

              <div>
                <span className="font-semibold text-slate-700">Procedure Steps:</span>
                <ol className="list-decimal pl-4 space-y-0.5 text-slate-700 mt-0.5">
                  {dp.procedureSteps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>

              <div className="flex justify-between items-center pt-2 text-[11px] text-slate-500 border-t border-slate-100">
                <span>Instructor: <strong className="text-slate-800">{dp.officerName}</strong></span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenModal(dp)}
                    className="p-1 text-slate-600 hover:text-emerald-700 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(dp.id)}
                    className="p-1 text-slate-600 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {plans.length === 0 && !loading && (
          <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
            <Wrench className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium">No demonstration plans scheduled yet.</p>
            <p className="text-xs text-slate-400 mt-1">Click "Schedule Practical Demo" to add workshop practical sessions.</p>
          </div>
        )}
      </div>

      {/* MODAL: CREATE / EDIT DEMONSTRATION PLAN */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs text-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                {editingPlan ? 'Edit Demonstration Plan' : 'Schedule Practical Demonstration'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block font-semibold mb-1 text-slate-700">Practical Title</label>
                <input
                  type="text"
                  value={form.practicalTitle}
                  onChange={(e) => setForm({ ...form, practicalTitle: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block font-semibold mb-1 text-slate-700">Allotted Hours</label>
                  <input
                    type="number"
                    value={form.allottedHours}
                    onChange={(e) => setForm({ ...form, allottedHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
                <div className="col-span-1">
                  <label className="block font-semibold mb-1 text-slate-700">Target Date</label>
                  <input
                    type="date"
                    value={form.targetDate}
                    onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
                <div className="col-span-1">
                  <label className="block font-semibold mb-1 text-slate-700">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">Tools / Equipment Required</label>
                <input
                  type="text"
                  value={form.toolsRequired}
                  onChange={(e) => setForm({ ...form, toolsRequired: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">Objectives & Skill Outcome</label>
                <textarea
                  rows={2}
                  value={form.objectives}
                  onChange={(e) => setForm({ ...form, objectives: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">Procedure Steps (Comma or line separated)</label>
                <textarea
                  rows={3}
                  value={form.procedureSteps.join('\n')}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      procedureSteps: e.target.value.split('\n').filter((s) => s.trim().length > 0),
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  required
                />
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
                  <span>Save Demo Plan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
