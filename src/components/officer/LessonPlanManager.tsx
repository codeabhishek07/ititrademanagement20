import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Edit2, Trash2, Check, X, Printer, Download, Calendar } from 'lucide-react';
import { LessonPlan, Trade } from '../../types.ts';
import { fetchLessonPlans, saveLessonPlan, deleteLessonPlan } from '../../api.ts';

interface LessonPlanManagerProps {
  tradeId: string;
  tradeName: string;
  officerName: string;
}

export const LessonPlanManager: React.FC<LessonPlanManagerProps> = ({ tradeId, tradeName, officerName }) => {
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<LessonPlan | null>(null);
  const [toast, setToast] = useState('');

  const [form, setForm] = useState({
    unitName: 'Unit 1: Introduction to Trade Tools & Safety',
    syllabusRef: 'NCQF / DGT Module 1.1 - Safety Precautions',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    status: 'Pending' as 'Pending' | 'Completed',
    objectives: 'To impart thorough understanding of workshop safety rules, PPE usage, and hand tool identification.',
    teachingAid: 'Whiteboard, Chart of PPE symbols, Safety Demonstration Models',
    keyLearningPoints: '1. First aid rules in electrical/workshop accidents.\n2. Classification of fire and extinguishers.\n3. Safe operation of bench vices.',
    assignment: 'Submit 5 safety precautions notebook notes by Friday.',
    reference: 'ITI NCVT Trade Theory Standard Publication (DGT)',
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadPlans = async () => {
    if (!tradeId) return;
    setLoading(true);
    try {
      const data = await fetchLessonPlans(tradeId);
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

  const handleOpenModal = (p?: LessonPlan) => {
    if (p) {
      setEditingPlan(p);
      setForm({
        unitName: p.unitName,
        syllabusRef: p.syllabusRef,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        objectives: p.objectives,
        teachingAid: p.teachingAid,
        keyLearningPoints: p.keyLearningPoints,
        assignment: p.assignment,
        reference: p.reference,
      });
    } else {
      setEditingPlan(null);
      setForm({
        unitName: 'Unit: Practical Workshop Module',
        syllabusRef: 'NCVT Syllabus Reference',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        status: 'Pending',
        objectives: 'To impart practical workshop skills and theoretical foundation.',
        teachingAid: 'Blackboard, Workshop Tools, Charts',
        keyLearningPoints: '1. Standard operating procedure.\n2. Verification of components.',
        assignment: 'Record practical observation in progress card.',
        reference: 'DGT Standard Curriculum',
      });
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveLessonPlan({
        id: editingPlan?.id,
        tradeId,
        officerName,
        ...form,
      });
      showToast(editingPlan ? 'Lesson plan updated successfully' : 'Lesson plan created successfully');
      setModalOpen(false);
      loadPlans();
    } catch (err: any) {
      alert(err.message || 'Failed to save lesson plan');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this lesson plan?')) return;
    try {
      await deleteLessonPlan(id);
      showToast('Lesson plan deleted');
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
              <BookOpen className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Lesson Plan Generator (पाठ योजना जनरेटर)</h3>
              <p className="text-xs text-slate-500">
                Official NCVT trade syllabus mapping and lesson planning for {tradeName}
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
          <span>Create New Lesson Plan</span>
        </button>
      </div>

      {/* Lesson Plans Cards / Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map((lp) => (
          <div key={lp.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3 relative hover:border-emerald-300 transition-all">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 mb-1">
                  {lp.syllabusRef}
                </span>
                <h4 className="font-bold text-slate-900 text-sm">{lp.unitName}</h4>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                  lp.status === 'Completed'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {lp.status}
              </span>
            </div>

            <div className="text-xs text-slate-600 space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[11px]">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                <span>Planned Schedule: {lp.startDate} to {lp.endDate}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-700">Objectives:</span> {lp.objectives}
              </div>
              <div>
                <span className="font-semibold text-slate-700">Teaching Aids:</span> {lp.teachingAid}
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 font-mono text-[11px] text-slate-700 whitespace-pre-line">
                {lp.keyLearningPoints}
              </div>
              <div className="flex justify-between items-center pt-2 text-[11px] text-slate-500 border-t border-slate-100">
                <span>Instructor: <strong className="text-slate-800">{lp.officerName}</strong></span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenModal(lp)}
                    className="p-1 text-slate-600 hover:text-emerald-700 cursor-pointer"
                    title="Edit"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(lp.id)}
                    className="p-1 text-slate-600 hover:text-rose-600 cursor-pointer"
                    title="Delete"
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
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium">No lesson plans recorded for this trade yet.</p>
            <p className="text-xs text-slate-400 mt-1">Click "Create New Lesson Plan" to add syllabus units.</p>
          </div>
        )}
      </div>

      {/* MODAL: CREATE / EDIT LESSON PLAN */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs text-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                {editingPlan ? 'Edit Lesson Plan' : 'Create New Lesson Plan'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block font-semibold mb-1 text-slate-700">Unit / Module Name</label>
                <input
                  type="text"
                  value={form.unitName}
                  onChange={(e) => setForm({ ...form, unitName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Syllabus Reference</label>
                  <input
                    type="text"
                    value={form.syllabusRef}
                    onChange={(e) => setForm({ ...form, syllabusRef: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold"
                  >
                    <option value="Pending">Pending (लंबित)</option>
                    <option value="Completed">Completed (पूर्ण)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Planned Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Planned End Date</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">Instructional Objectives</label>
                <textarea
                  rows={2}
                  value={form.objectives}
                  onChange={(e) => setForm({ ...form, objectives: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">Teaching Aids Required</label>
                <input
                  type="text"
                  value={form.teachingAid}
                  onChange={(e) => setForm({ ...form, teachingAid: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">Key Learning Points (बुनियादी बिंदु)</label>
                <textarea
                  rows={3}
                  value={form.keyLearningPoints}
                  onChange={(e) => setForm({ ...form, keyLearningPoints: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">Assignment / Homework</label>
                <input
                  type="text"
                  value={form.assignment}
                  onChange={(e) => setForm({ ...form, assignment: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
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
                  <span>Save Lesson Plan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
