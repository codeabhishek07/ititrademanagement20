import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  Download,
  Trash2,
  Search,
  Cloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FolderOpen,
  ExternalLink,
  HardDrive,
} from 'lucide-react';
import {
  DocumentCategory,
  StoredDocumentRecord,
  Trade,
  AcademicSession,
  UserRole,
} from '../types.ts';
import {
  fetchDocuments,
  uploadDocument,
  deleteDocument,
  fetchCloudStatus,
} from '../api.ts';
import {
  tryDirectStorageUpload,
  tryDirectStorageDelete,
} from '../firebase.ts';

interface DocumentVaultPanelProps {
  currentUserId: string;
  currentUserName: string;
  currentUserRole: UserRole;
  trades: Trade[];
  sessions: AcademicSession[];
  defaultTradeId?: string;
  readOnly?: boolean;
}

const CATEGORIES: DocumentCategory[] = [
  'Circular & Order',
  'Study Material',
  'Practical Sheet',
  'Leave Medical Certificate',
  'Trainee Document',
  'Institutional Backup',
  'Other',
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const DocumentVaultPanel: React.FC<DocumentVaultPanelProps> = ({
  currentUserId,
  currentUserName,
  currentUserRole,
  trades,
  sessions,
  defaultTradeId,
  readOnly = false,
}) => {
  const [documents, setDocuments] = useState<StoredDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [storageMode, setStorageMode] = useState<{
    bucketActive: boolean;
    bucket: string;
    mode: string;
  } | null>(null);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterTradeId, setFilterTradeId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Upload Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('Circular & Order');
  const [selectedTradeId, setSelectedTradeId] = useState<string>(defaultTradeId || '');
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    sessions.find((s) => s.status === 'active')?.id || sessions[0]?.id || ''
  );
  const [remarks, setRemarks] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [docsList, cloud] = await Promise.all([
        fetchDocuments(
          currentUserRole === 'trainee' && defaultTradeId
            ? { tradeId: defaultTradeId }
            : undefined
        ),
        fetchCloudStatus().catch(() => null),
      ]);
      setDocuments(docsList);
      if (cloud?.storage) {
        setStorageMode(cloud.storage);
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to load documents.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUserId, defaultTradeId]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setStatusMessage({ type: 'error', text: 'Please select a file to upload (max 8 MB).' });
      return;
    }
    if (selectedFile.size > 8 * 1024 * 1024) {
      setStatusMessage({ type: 'error', text: 'Selected file exceeds maximum limit of 8 MB.' });
      return;
    }

    try {
      setUploading(true);
      setStatusMessage(null);

      // Read file as data URL (base64)
      const base64Content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(selectedFile);
      });

      // Attempt direct Firebase Storage upload when bucket is active
      let existingDownloadUrl: string | undefined;
      let existingStoragePath: string | undefined;
      if (storageMode?.bucketActive) {
        const cleanName = selectedFile.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
        const path = `iti_documents/${currentUserRole}/${currentUserId}/${Date.now()}_${cleanName}`;
        const url = await tryDirectStorageUpload(path, selectedFile, selectedFile.type);
        if (url) {
          existingDownloadUrl = url;
          existingStoragePath = path;
        }
      }

      const res = await uploadDocument({
        title: title.trim() || selectedFile.name,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || 'application/octet-stream',
        base64Content: existingDownloadUrl ? undefined : base64Content,
        category,
        uploadedById: currentUserId,
        uploadedByName: currentUserName,
        uploadedByRole: currentUserRole,
        tradeId: selectedTradeId || undefined,
        sessionId: selectedSessionId || undefined,
        remarks: remarks.trim() || undefined,
        existingDownloadUrl,
        existingStoragePath,
      });

      setDocuments((prev) => [res.document, ...prev]);
      setTitle('');
      setRemarks('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setStatusMessage({
        type: 'success',
        text: `File "${res.document.title}" permanently saved to Firebase (${
          res.document.storageProvider === 'firebase_storage'
            ? 'Firebase Storage'
            : 'Cloud Firestore Vault'
        }).`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docItem: StoredDocumentRecord) => {
    try {
      setDeletingId(docItem.id);
      if (docItem.storageProvider === 'firebase_storage' && docItem.storagePath) {
        await tryDirectStorageDelete(docItem.storagePath);
      }
      await deleteDocument(docItem.id);
      setDocuments((prev) => prev.filter((d) => d.id !== docItem.id));
      setConfirmDeleteId(null);
      setStatusMessage({ type: 'success', text: `Deleted "${docItem.title}" permanently.` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to delete document.' });
    } finally {
      setDeletingId(null);
    }
  };

  const filteredDocs = documents.filter((d) => {
    if (filterCategory !== 'all' && d.category !== filterCategory) return false;
    if (filterTradeId !== 'all' && d.tradeId && d.tradeId !== filterTradeId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        d.title.toLowerCase().includes(q) ||
        d.fileName.toLowerCase().includes(q) ||
        d.uploadedByName.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const canDeleteDoc = (d: StoredDocumentRecord) => {
    if (readOnly) return false;
    if (currentUserRole === 'admin') return true;
    return d.uploadedById === currentUserId;
  };

  return (
    <div className="space-y-6">
      {/* Cloud Storage Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-300 shrink-0">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-white">
              Persistent Institutional Document &amp; File Vault
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Circulars, practical sheets, study resources, and leave certificates are stored in Firebase and accessible across every browser &amp; login session.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-emerald-300 font-semibold">
            <HardDrive className="w-3.5 h-3.5" />
            {storageMode?.bucketActive
              ? 'Firebase Storage + Firestore Active'
              : 'Cloud Firestore Permanent File Store'}
          </span>
          <button
            type="button"
            onClick={loadData}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
            title="Refresh documents"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span className="font-medium">{statusMessage.text}</span>
        </div>
      )}

      {/* Upload Form (for Admin / Officer or non-readonly) */}
      {!readOnly && (
        <form
          onSubmit={handleUpload}
          className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4 text-xs"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <Upload className="w-4 h-4 text-blue-600" />
              <span>Upload New Document to Cloud Vault</span>
            </div>
            <span className="text-[11px] text-slate-500">Max file size: 8 MB (PDF, Image, Excel, Word)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Document Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., AITT Exam Practical Schedule 2026"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Trade Scope</label>
              <select
                value={selectedTradeId}
                onChange={(e) => setSelectedTradeId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Trades (Institute-wide)</option>
                {trades.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Academic Session</label>
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Sessions</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Select File *</label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:bg-slate-900 file:text-white file:text-xs file:font-semibold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Remarks (Optional)</label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Order ref no. or brief note"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold rounded-xl flex items-center gap-2 cursor-pointer"
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Uploading to Firebase...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Save File Permanently</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Documents List & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <FolderOpen className="w-4 h-4 text-amber-600" />
            <span>Saved Cloud Documents ({filteredDocs.length})</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title or filename..."
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
              />
            </div>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={filterTradeId}
              onChange={(e) => setFilterTradeId(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
            >
              <option value="all">All Trades</option>
              {trades.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
            <span>Loading persistent files from Firebase...</span>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">No documents saved yet for this filter</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Uploaded circulars, practical sheets, and leave certificates appear here automatically.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredDocs.map((docItem) => {
              const tradeObj = trades.find((t) => t.id === docItem.tradeId);
              return (
                <div
                  key={docItem.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors text-xs"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">{docItem.title}</div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                        <span className="font-mono">{docItem.fileName}</span>
                        <span>·</span>
                        <span>{formatBytes(docItem.sizeBytes)}</span>
                        <span>·</span>
                        <span className="text-blue-700 font-semibold">{docItem.category}</span>
                        {tradeObj && (
                          <>
                            <span>·</span>
                            <span>{tradeObj.name}</span>
                          </>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Uploaded by <strong className="text-slate-600">{docItem.uploadedByName}</strong> ({docItem.uploadedByRole}) on{' '}
                        {new Date(docItem.createdAt).toLocaleString('en-IN')}
                        {docItem.remarks ? ` · Note: ${docItem.remarks}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={docItem.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={docItem.fileName}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                    <a
                      href={docItem.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100"
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    {canDeleteDoc(docItem) && (
                      confirmDeleteId === docItem.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={deletingId === docItem.id}
                            onClick={() => handleDelete(docItem)}
                            className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg cursor-pointer"
                          >
                            {deletingId === docItem.id ? 'Removing...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(docItem.id)}
                          className="p-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          title="Delete file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
