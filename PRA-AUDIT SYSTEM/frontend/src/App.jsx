import axios from 'axios';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Home, Map, FileText, CheckSquare, BarChart2, Settings, 
  Bell, Search, Upload, Eye, X, AlertTriangle, CheckCircle, 
  Clock, Download, ChevronRight, Menu, User, Folder, Plus, ChevronDown,
  Edit2, Maximize, Minimize, ZoomIn, ZoomOut, Hand, PenTool, RotateCcw,
  Trash2, File, Lock, LogOut, Copy, Link as LinkIcon
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

// Tabel: locations
const MOCK_LOCATIONS = [
  { id: 1, name: 'TJ Priok', pic: 'Panji' },
  { id: 2, name: 'TJ Uban', pic: 'Bima' },
  { id: 3, name: 'Palembang', pic: 'Bima' },
  { id: 4, name: 'Cilacap', pic: 'Panji' },
  { id: 5, name: 'Dumai', pic: 'Bima' },
  { id: 6, name: 'Bali', pic: 'Panji' },
  { id: 7, name: 'VP TE', pic: 'Panji' },
];

// Tabel: audit_programs
const MOCK_AUDITS = [
  { id: 'A1', name: 'Audit ISO 17020 QnQ' },
  { id: 'A2', name: 'Audit BPK' },
  { id: 'A3', name: 'Audit Internal (K3)' },
];

// Tabel: Users (Database Pengguna Simulasi)
const MOCK_USERS = [
  { username: 'admin', password: '123', role: 'auditor', name: 'Super Auditor' },
  { username: 'priok', password: '123', role: 'auditee', location_id: 1, name: 'Admin TJ Priok' },
  { username: 'uban', password: '123', role: 'auditee', location_id: 2, name: 'Admin TJ Uban' },
  { username: 'palembang', password: '123', role: 'auditee', location_id: 3, name: 'Admin Palembang' },
];

// Tabel: documents_master
const MOCK_DOCS = [
  { id: 'D01', name: 'CV Personil' },
  { id: 'D02', name: 'FP-DSDM01-02 Uraian Jabatan' },
  { id: 'D03', name: 'FP-DSDM31-03 Jadwal Pemantauan Kinerja' },
  { id: 'D04', name: 'FP-DSDM31-04 Form Penilaian Kinerja' },
  { id: 'D05', name: 'FP-MR38-02 Pernyataan Kesediaan Personil' },
  { id: 'D06', name: 'FP-MR40-01 Daftar Peralatan' },
  { id: 'D07', name: 'FP-MR40-02 Daftar Pemantauan Peralatan' },
  { id: 'D08', name: 'FP-MR40-03 Program Kalibrasi Peralatan' },
  { id: 'D09', name: 'FP-MR40-04 Laporan Kerusakan Alat' },
  { id: 'D10', name: 'FP-MR40-05 Log Book Penggunaan Alat' },
  { id: 'D11', name: 'Sertifikat Kalibrasi' },
];

// Tabel: audit_records (Data dummy diperbarui untuk Multiple Files)
const generateInitialRecords = () => {
  const records = [];
  MOCK_AUDITS.forEach(audit => {
    MOCK_LOCATIONS.forEach(loc => {
      MOCK_DOCS.forEach(doc => {
        const rand = Math.random();
        let status = 'red'; 
        let notes = '';
        let files = []; // Sekarang menggunakan array of files
        let updatedAt = null;

        if (rand > 0.7) {
          status = 'clear'; 
          notes = 'OK, sudah sesuai format.';
          updatedAt = '2026-05-18 10:00:00';
          // Simulasi dokumen memiliki banyak file (misal CV Personil)
          if (doc.id === 'D01' || doc.id === 'D11') {
            files = [
              { id: 'f1', name: `${doc.name} - Personil A.pdf` },
              { id: 'f2', name: `${doc.name} - Personil B.pdf` },
              { id: 'f3', name: `${doc.name} - Personil C.pdf` }
            ];
          } else {
            files = [{ id: 'f1', name: `${doc.name}_Final.pdf` }];
          }
        } else if (rand > 0.4) {
          status = 'yellow'; 
          notes = doc.id === 'D01' ? 'Aries Expired AISI kapan? Keterangan terbit 2018' : 'Struktur pada Jobdes Belum di Update';
          updatedAt = '2026-05-19 14:30:00';
          // Simulasi: Auditee telah menambahkan file revisi baru
          files = [
            { id: 'f1', name: `${doc.name}_Draft_v1.pdf` },
            { id: 'f2', name: `${doc.name}_Revisi_v2.pdf`, isRevised: true }
          ];
        }

        records.push({
          id: `${audit.id}-${loc.id}-${doc.id}-2026`,
          audit_id: audit.id,
          location_id: loc.id,
          document_id: doc.id,
          year: 2026,
          status: status, 
          notes: notes,
          files: files,
          updated_at: updatedAt
        });
      });
    });
  });
  return records;
};

const StatusBadge = ({ status }) => {
  const badges = {
    red: <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200"><AlertTriangle className="w-3 h-3 mr-1" /> Belum Mengisi</span>,
    yellow: <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200"><Clock className="w-3 h-3 mr-1" /> Perlu Perbaikan</span>,
    clear: <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200"><CheckCircle className="w-3 h-3 mr-1" /> Sesuai</span>,
  };
  return badges[status] || badges.red;
};

const CHART_COLORS = ['#ef4444', '#eab308', '#22c55e'];

// --- KOMPONEN: LAYAR LOGIN ---
const LoginScreen = ({ users, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('http://localhost:5000/api/login', { username, password });
      if (res.data.success) {
        onLogin(res.data.user);
      } else {
        setError(res.data.message || 'Username atau password salah!');
      }
    } catch (err) {
      setError('Terjadi kesalahan koneksi ke server.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white text-2xl shadow-lg">PA</div>
        </div>
        <h2 className="text-center text-3xl font-extrabold text-slate-900">Pra-Audit System</h2>
        <p className="mt-2 text-center text-sm text-slate-600">Masuk ke akun Anda untuk melanjutkan</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-xl sm:px-10 border border-slate-200">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Username</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input type="text" required value={username} onChange={(e) => setUsername(e.target.value)} className="appearance-none block w-full pl-10 px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Masukkan username..." />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="appearance-none block w-full pl-10 px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="••••••••" />
              </div>
            </div>

            {error && <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg flex items-center"><AlertTriangle className="w-4 h-4 mr-2"/> {error}</div>}

            <div>
              <button type="submit" className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition">
                Masuk
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300" /></div>
              <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-slate-500">Akun Demo (Klik untuk login cepat)</span></div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={() => { setUsername('admin'); setPassword('123'); }} type="button" className="w-full inline-flex justify-center py-2 px-4 border border-slate-300 rounded-md shadow-sm bg-white text-xs font-medium text-slate-700 hover:bg-slate-50">Auditor Pusat</button>
              <button onClick={() => { setUsername('priok'); setPassword('123'); }} type="button" className="w-full inline-flex justify-center py-2 px-4 border border-slate-300 rounded-md shadow-sm bg-white text-xs font-medium text-slate-700 hover:bg-slate-50">Auditee Cabang</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SimpleModal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
        <h3 className="text-lg font-bold text-slate-800 mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
};

// --- KOMPONEN: MODAL PRATINJAU & PENILAIAN DOKUMEN ---
const DocumentModal = ({ isOpen, onClose, record, locName, docName, role, onUpdate }) => {
  const [status, setStatus] = useState(record?.status || 'red');
  const [notes, setNotes] = useState(record?.notes || '');
  const [files, setFiles] = useState(record?.files || []);
  const [activeFile, setActiveFile] = useState(record?.files?.[0] || null);
  const [isMaximized, setIsMaximized] = useState(false);

  // States untuk Interactive Viewer
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 50, y: 40 });
  const [tool, setTool] = useState('hand'); 
  const [linesByFile, setLinesByFile] = useState({}); 
  const [currentLine, setCurrentLine] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  
  const viewportRef = useRef(null);

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdate({ ...record, status, notes, files, updated_at: new Date().toISOString() });
    onClose();
  };

  // Simulasi Auditee Menambah File
  const handleSimulatedUpload = () => {
    const newFile = { 
      id: `f${Date.now()}`, 
      name: `${docName} - File Tambahan ${files.length + 1}.pdf`,
      isRevised: true // Menandai file ini sebagai file revisi
    };
    const newFiles = [...files, newFile];
    setFiles(newFiles);
    if (!activeFile) setActiveFile(newFile);
    setStatus('yellow'); 
  };

  // Simulasi Auditee Menghapus File
  const handleRemoveFile = (fileIdToRemove) => {
    const newFiles = files.filter(f => f.id !== fileIdToRemove);
    setFiles(newFiles);
    if (activeFile?.id === fileIdToRemove) {
      setActiveFile(newFiles.length > 0 ? newFiles[0] : null);
    }
    if (newFiles.length === 0) setStatus('red');
  };

  const activeLines = (activeFile && linesByFile[activeFile.id]) || [];
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));

  const handlePointerDown = (e) => {
    if (!activeFile) return;
    if (tool === 'hand') {
      setIsDragging(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    } else if (tool === 'pencil' && viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const docX = (e.clientX - rect.left - pan.x) / zoom;
      const docY = (e.clientY - rect.top - pan.y) / zoom;
      setCurrentLine([{ x: docX, y: docY }]);
    }
  };

  const handlePointerMove = (e) => {
    if (!activeFile) return;
    if (tool === 'hand' && isDragging) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    } else if (tool === 'pencil' && currentLine && viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const docX = (e.clientX - rect.left - pan.x) / zoom;
      const docY = (e.clientY - rect.top - pan.y) / zoom;
      setCurrentLine(prev => [...prev, { x: docX, y: docY }]);
    }
  };

  const handlePointerUp = () => {
    if (!activeFile) return;
    if (tool === 'hand') {
      setIsDragging(false);
    } else if (tool === 'pencil' && currentLine) {
      setLinesByFile(prev => ({
        ...prev,
        [activeFile.id]: [...(prev[activeFile.id] || []), currentLine]
      }));
      setCurrentLine(null);
    }
  };

  const clearCurrentFileLines = () => {
    if (!activeFile) return;
    setLinesByFile(prev => ({ ...prev, [activeFile.id]: [] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className={`bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${isMaximized ? 'w-[98vw] h-[98vh]' : 'w-full max-w-6xl h-[90vh]'}`}>
         
         {/* Header */}
         <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">{docName}</h3>
              <p className="text-sm text-slate-500">{locName}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setIsMaximized(!isMaximized)} className="text-slate-400 hover:text-blue-600 bg-white border border-slate-200 hover:border-blue-200 hover:bg-blue-50 transition rounded-lg p-1.5" title={isMaximized ? "Kembali ke ukuran awal" : "Perbesar layar"}>
                {isMaximized ? <Minimize className="w-5 h-5"/> : <Maximize className="w-5 h-5"/>}
              </button>
              <button onClick={onClose} className="text-slate-400 hover:text-red-600 bg-white border border-slate-200 hover:border-red-200 hover:bg-red-50 transition rounded-lg p-1.5" title="Tutup">
                <X className="w-5 h-5"/>
              </button>
            </div>
         </div>
         
         {/* Body */}
         <div className="flex-1 overflow-hidden flex flex-col lg:flex-row bg-slate-100">
            {/* INTERACTIVE DOCUMENT VIEWER */}
            <div className="flex-1 flex flex-col bg-slate-200/50 border-r border-slate-200 overflow-hidden relative">
               
               {/* Multi-File Tab Bar */}
               {files.length > 0 && (
                 <div className="bg-slate-100 border-b border-slate-200 flex items-center px-2 py-2 gap-2 overflow-x-auto shrink-0 hide-scrollbar">
                   {files.map(f => (
                     <button 
                       key={f.id}
                       onClick={() => setActiveFile(f)}
                       className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap border ${activeFile?.id === f.id ? 'bg-white text-blue-700 border-blue-200 shadow-sm' : 'bg-transparent text-slate-600 border-transparent hover:bg-slate-200/50'}`}
                     >
                       <FileText className={`w-4 h-4 mr-2 ${activeFile?.id === f.id ? 'text-blue-500' : 'text-slate-400'}`} />
                       {f.name}
                       {f.isRevised && (
                         <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">REVISI</span>
                       )}
                     </button>
                   ))}
                 </div>
               )}

               {/* Viewer Toolbar */}
               <div className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 z-10 shadow-sm">
                 <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setTool('hand')} className={`p-1.5 rounded-md transition ${tool === 'hand' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'}`} title="Geser (Pan)">
                      <Hand className="w-4 h-4"/>
                    </button>
                    <button onClick={() => setTool('pencil')} className={`p-1.5 rounded-md transition ${tool === 'pencil' ? 'bg-white shadow-sm text-red-500' : 'text-slate-500 hover:text-slate-800'}`} title="Coret / Tandai Kesalahan">
                      <PenTool className="w-4 h-4"/>
                    </button>
                    <div className="w-px h-4 bg-slate-300 mx-1"></div>
                    <button onClick={clearCurrentFileLines} className="p-1.5 rounded-md text-slate-500 hover:text-red-500 hover:bg-white transition" title="Hapus Semua Coretan di File Ini">
                      <RotateCcw className="w-4 h-4"/>
                    </button>
                 </div>
                 
                 <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <button onClick={handleZoomOut} className="p-1.5 rounded-md text-slate-500 hover:bg-white transition"><ZoomOut className="w-4 h-4"/></button>
                    <span className="text-xs font-bold text-slate-600 w-12 text-center">{Math.round(zoom * 100)}%</span>
                    <button onClick={handleZoomIn} className="p-1.5 rounded-md text-slate-500 hover:bg-white transition"><ZoomIn className="w-4 h-4"/></button>
                 </div>
               </div>

               {/* Viewport (Area Canvas) */}
               {activeFile ? (
                 <div
                   ref={viewportRef}
                   className="flex-1 overflow-hidden relative touch-none select-none bg-slate-300/40"
                   style={{ cursor: tool === 'hand' ? (isDragging ? 'grabbing' : 'grab') : 'crosshair' }}
                   onPointerDown={handlePointerDown}
                   onPointerMove={handlePointerMove}
                   onPointerUp={handlePointerUp}
                   onPointerLeave={handlePointerUp}
                   onWheel={(e) => {
                     if (e.ctrlKey) {
                       const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
                       setZoom(prev => Math.max(0.25, Math.min(prev + zoomDelta, 3)));
                     } else {
                       setPan(prev => ({
                         x: prev.x - e.deltaX,
                         y: prev.y - e.deltaY
                       }));
                     }
                   }}
                 >
                   <div
                      className="absolute shadow-xl bg-white border border-slate-200"
                      style={{
                         width: 600, height: 1200,
                         transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                         transformOrigin: '0 0',
                      }}
                   >
                      <div className="p-14 pointer-events-none opacity-80">
                          <div className="flex items-center gap-3 border-b-2 border-slate-800 pb-4 mb-8">
                            <div className="w-12 h-12 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-lg">LOG</div>
                            <div>
                              <h1 className="text-2xl font-bold text-slate-800 leading-tight">DOKUMEN AUDIT</h1>
                              <p className="text-sm text-slate-500 tracking-wider">PT. PERTAMINA INTERNATIONAL SHIPPING</p>
                            </div>
                          </div>
                          
                          <h2 className="text-xl font-bold text-slate-800 mb-2">{docName}</h2>
                          <p className="text-blue-600 font-medium mb-6">File: {activeFile.name}</p>
                          
                          <div className="space-y-5">
                             <div className="h-3 bg-slate-200 rounded w-full"></div>
                             <div className="h-3 bg-slate-200 rounded w-11/12"></div>
                             <div className="h-3 bg-slate-200 rounded w-full"></div>
                             <div className="h-3 bg-slate-200 rounded w-4/5"></div>
                             <br />
                             <div className="h-3 bg-slate-200 rounded w-full"></div>
                             <div className="h-3 bg-slate-200 rounded w-full"></div>
                             <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                             <br />
                             {/* Konten Tambahan Halaman Bawah */}
                             <div className="border-t border-slate-300 pt-6 mt-6">
                               <h3 className="font-bold text-slate-700 mb-4">Bagian 2: Detail Informasi</h3>
                               <div className="h-3 bg-slate-200 rounded w-full mb-3"></div>
                               <div className="h-3 bg-slate-200 rounded w-full mb-3"></div>
                               <div className="h-3 bg-slate-200 rounded w-5/6 mb-3"></div>
                               <div className="h-3 bg-slate-200 rounded w-full mb-3"></div>
                               <div className="h-3 bg-slate-200 rounded w-3/4 mb-3"></div>
                             </div>
                             <br />
                             <div className="border border-slate-300 p-4 space-y-3 rounded bg-slate-50">
                                <div className="h-3 bg-slate-300 w-1/3 mb-4"></div>
                                <div className="h-3 bg-slate-200 w-full"></div>
                                <div className="h-3 bg-slate-200 w-full"></div>
                                <div className="h-3 bg-slate-200 w-full"></div>
                             </div>
                          </div>
                      </div>

                      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
                         {activeLines.map((line, i) => (
                            <polyline key={i} points={line.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
                         ))}
                         {currentLine && (
                            <polyline points={currentLine.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
                         )}
                      </svg>
                   </div>
                 </div>
               ) : (
                 <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                    <File className="w-16 h-16 text-slate-300 mb-4" />
                    <p className="font-medium text-slate-500">Belum ada file yang diunggah.</p>
                 </div>
               )}
            </div>
            
            {/* PANEL FORM PENILAIAN & UPLOAD */}
            <div className={`bg-white shrink-0 flex flex-col ${isMaximized ? 'w-80' : 'w-full lg:w-[350px]'} overflow-y-auto border-l border-slate-200`}>
                <div className="p-6 flex flex-col h-full gap-5">
                  {/* BAGIAN KHUSUS AUDITOR: STATUS & CATATAN */}
                  {role === 'auditor' && (
                    <>
                      <div>
                         <label className="block text-sm font-semibold text-slate-700 mb-3">Status Dokumen Master</label>
                         <div className="space-y-2">
                            <label className={`flex items-center p-3 rounded-xl border-2 cursor-pointer transition-colors ${status === 'clear' ? 'border-green-500 bg-green-50 shadow-sm' : 'border-slate-200 hover:bg-slate-50'}`}>
                              <input type="radio" name="status" value="clear" checked={status === 'clear'} onChange={() => setStatus('clear')} className="hidden" />
                              <CheckCircle className={`w-5 h-5 mr-3 ${status === 'clear' ? 'text-green-600' : 'text-slate-400'}`} /> Sesuai
                            </label>
                            <label className={`flex items-center p-3 rounded-xl border-2 cursor-pointer transition-colors ${status === 'yellow' ? 'border-yellow-500 bg-yellow-50 shadow-sm' : 'border-slate-200 hover:bg-slate-50'}`}>
                              <input type="radio" name="status" value="yellow" checked={status === 'yellow'} onChange={() => setStatus('yellow')} className="hidden" />
                              <Clock className={`w-5 h-5 mr-3 ${status === 'yellow' ? 'text-yellow-600' : 'text-slate-400'}`} /> Perlu Perbaikan
                            </label>
                            <label className={`flex items-center p-3 rounded-xl border-2 cursor-pointer transition-colors ${status === 'red' ? 'border-red-500 bg-red-50 shadow-sm' : 'border-slate-200 hover:bg-slate-50'}`}>
                              <input type="radio" name="status" value="red" checked={status === 'red'} onChange={() => setStatus('red')} className="hidden" />
                              <AlertTriangle className={`w-5 h-5 mr-3 ${status === 'red' ? 'text-red-600' : 'text-slate-400'}`} /> Belum Sesuai / Kosong
                            </label>
                         </div>
                      </div>
                      <div className="flex flex-col shrink-0">
                         <label className="block text-sm font-semibold text-slate-700 mb-2">Catatan Pemeriksa</label>
                         <textarea 
                            value={notes} 
                            onChange={(e) => setNotes(e.target.value)} 
                            className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm focus:border-blue-500 focus:ring-0 outline-none transition resize-none min-h-[120px]" 
                            placeholder="Masukkan catatan temuan atau arahan perbaikan di sini..."
                         ></textarea>
                      </div>
                    </>
                  )}

                  {/* BAGIAN MANAJEMEN FILE (TERSEDIA UNTUK SEMUA ROLE) */}
                  <div className={`flex flex-col flex-1 gap-4 ${role === 'auditor' ? 'mt-2 border-t border-slate-200 pt-5' : ''}`}>
                     <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shrink-0">
                       <h4 className="font-semibold text-slate-800 mb-3 text-sm flex items-center">
                         <Folder className="w-4 h-4 mr-2 text-blue-500"/> File Terunggah ({files.length})
                       </h4>
                       <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                         {files.length === 0 ? (
                           <p className="text-xs text-slate-500 italic">Belum ada file.</p>
                         ) : files.map((f, i) => (
                           <div key={f.id} className="flex items-center justify-between bg-white p-2.5 border border-slate-200 rounded-lg shadow-sm group hover:border-blue-300 transition">
                             <div className="flex items-center overflow-hidden mr-2">
                               <FileText className="w-4 h-4 text-blue-500 mr-2 flex-shrink-0" />
                               <span className="text-xs text-slate-700 truncate font-medium">{f.name}</span>
                               {f.isRevised && (
                                 <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 flex-shrink-0">REVISI</span>
                               )}
                             </div>
                             <button 
                               onClick={() => handleRemoveFile(f.id)}
                               className="text-slate-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition shrink-0"
                               title="Hapus File"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                           </div>
                         ))}
                       </div>
                     </div>
                     
                     <div 
                       onClick={handleSimulatedUpload}
                       className="flex flex-col justify-center items-center text-center p-6 border-2 border-dashed border-blue-300 rounded-xl bg-blue-50 hover:bg-blue-100 transition cursor-pointer mt-auto"
                     >
                       <Upload className="w-10 h-10 text-blue-600 mb-3" />
                       <p className="text-sm font-bold text-slate-800 mb-1">Tambah File Baru</p>
                       <p className="text-xs text-slate-500">Klik untuk mensimulasikan unggah PDF/DOCX.</p>
                     </div>
                  </div>
                </div>
            </div>
         </div>
         
         {/* Footer */}
         <div className="p-4 border-t border-slate-200 flex justify-end gap-3 bg-white shrink-0">
            <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition">Tutup</button>
            <button onClick={handleSave} className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm rounded-xl transition">Simpan Perubahan</button>
         </div>
      </div>
    </div>
  );
};

// --------------------------------------------------------
const DashboardView = ({ records, audits, locations, docs }) => {
  const [selectedAuditDash, setSelectedAuditDash] = useState('A1');

  const stats = useMemo(() => {
    const filteredRecords = records.filter(r => r.audit_id === selectedAuditDash);
    const total = filteredRecords.length;
    const red = filteredRecords.filter(r => r.status === 'red').length;
    const yellow = filteredRecords.filter(r => r.status === 'yellow').length;
    const clear = filteredRecords.filter(r => r.status === 'clear').length;
    
    const locStats = locations.map(loc => {
      const locRecords = filteredRecords.filter(r => r.location_id === loc.id);
      return {
        name: loc.name,
        Sesuai: locRecords.filter(r => r.status === 'clear').length,
        Perbaikan: locRecords.filter(r => r.status === 'yellow').length,
        Kosong: locRecords.filter(r => r.status === 'red').length,
      };
    });

    return { total, red, yellow, clear, locStats, filteredRecords };
  }, [records, selectedAuditDash, locations]);

  const pieData = [
    { name: 'Belum Mengisi', value: stats.red },
    { name: 'Perlu Perbaikan', value: stats.yellow },
    { name: 'Sesuai', value: stats.clear },
  ];

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Dashboard Utama</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="text-sm text-slate-500 font-medium">Total Persyaratan Dokumen</div>
          <div className="text-3xl font-bold text-slate-800 mt-2">{stats.total}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-red-200 border-l-4 border-l-red-500">
          <div className="text-sm text-red-600 font-medium">Belum Mengisi</div>
          <div className="text-3xl font-bold text-slate-800 mt-2">{stats.red}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-yellow-200 border-l-4 border-l-yellow-500">
          <div className="text-sm text-yellow-600 font-medium">Perlu Perbaikan</div>
          <div className="text-3xl font-bold text-slate-800 mt-2">{stats.yellow}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-green-200 border-l-4 border-l-green-500">
          <div className="text-sm text-green-600 font-medium">Sesuai (Clear)</div>
          <div className="text-3xl font-bold text-slate-800 mt-2">{stats.clear}</div>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-white p-3 rounded-xl shadow-sm border border-slate-200">
        <label className="text-sm font-medium text-slate-600 flex items-center">
          <Folder className="w-4 h-4 mr-2" /> Menampilkan Data untuk:
        </label>
        <select 
          value={selectedAuditDash} 
          onChange={e => setSelectedAuditDash(e.target.value)}
          className="border border-slate-200 bg-slate-50 rounded-lg px-3 py-1.5 text-sm text-slate-800 outline-none font-bold focus:ring-2 focus:ring-blue-500"
        >
          {audits.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 flex items-center"><Bell className="w-5 h-5 mr-2 text-yellow-500"/> Notifikasi / Alert</h3>
          </div>
          <div className="p-4 flex-1 overflow-y-auto max-h-80 space-y-3">
            {stats.filteredRecords.filter(r => r.status === 'yellow').slice(0, 5).map(r => {
              const loc = locations.find(l => l.id === r.location_id);
              const doc = docs.find(d => d.id === r.document_id);
              return (
                <div key={r.id} className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 flex items-start">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{loc?.name} - {doc?.name}</div>
                    <div className="text-xs text-slate-600 mt-1">Catatan: {r.notes}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
           <h3 className="font-semibold text-slate-800 mb-4">Statistik Cabang</h3>
           <div className="h-72">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.locStats} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <RechartsTooltip cursor={{fill: '#f8fafc'}} />
                  <Legend />
                  <Bar dataKey="Kosong" stackId="a" fill="#ef4444" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="Perbaikan" stackId="a" fill="#eab308" />
                  <Bar dataKey="Sesuai" stackId="a" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
             </ResponsiveContainer>
           </div>
        </div>
      </div>
    </div>
  );
};

const LocationView = ({ location, audit, year, records, role, onUpdate, docs, onAddDoc, onEditLoc, onDeleteDoc, onEditDoc, onCopyDoc, searchQuery = '' }) => {
  const [selectedRecord, setSelectedRecord] = useState(null);

  const locRecords = docs
    .filter(doc => doc.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .map(doc => {
      const record = records.find(r => r.location_id === location.id && r.document_id === doc.id && r.audit_id === audit.id && r.year === year);
      return { doc, record: record || { status: 'red', notes: '', files: [] } };
    });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            {audit.name} — {location.name}
            {role === 'auditor' && (
              <button 
                onClick={() => onEditLoc(location)} 
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" 
                title="Edit Nama Cabang / PIC"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
          </h2>
          <p className="text-slate-500 mt-1">Tahun Audit: {year} • PIC: {location.pic}</p>
        </div>
        {role === 'auditor' && (
          <button 
            onClick={onAddDoc}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center shadow-sm transition"
          >
            <Plus className="w-4 h-4 mr-2" /> Tambah Kebutuhan Dokumen
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-4 w-12 text-center">No</th>
              <th className="p-4">Nama Dokumen</th>
              <th className="p-4 w-40">Status Review</th>
              <th className="p-4">Catatan Auditor</th>
              <th className="p-4 w-32 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {locRecords.map((row, idx) => (
              <tr key={row.doc.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                <td className="p-4 text-center">{idx + 1}</td>
                <td className="p-4 font-medium text-slate-800">
                  {row.doc.name}
                  {/* Badge Indikator Jumlah File Terlampir */}
                  {row.record.files && row.record.files.length > 0 && (
                    <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                      <File className="w-3 h-3 mr-1" /> {row.record.files.length} File
                    </span>
                  )}
                </td>
                <td className="p-4"><StatusBadge status={row.record.status} /></td>
                <td className="p-4 text-slate-500 truncate max-w-xs">{row.record.notes || '-'}</td>
                <td className="p-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button 
                      onClick={() => setSelectedRecord(row)}
                      className="inline-flex items-center justify-center px-3 py-1.5 bg-slate-100 text-blue-600 hover:bg-blue-600 hover:text-white border border-slate-200 hover:border-blue-600 font-medium rounded-lg transition"
                    >
                      Buka File
                    </button>
                    {role === 'auditor' && (
                      <>
                        <button
                          onClick={() => onEditDoc(row.doc)}
                          className="p-1.5 ml-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 rounded-lg transition"
                          title="Edit Nama Dokumen"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onCopyDoc(row.doc)}
                          className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 border border-transparent hover:border-green-200 rounded-lg transition"
                          title="Salin Dokumen"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteDoc(row.doc)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg transition"
                          title="Hapus Kebutuhan Dokumen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedRecord && (
        <DocumentModal 
          isOpen={true}
          onClose={() => setSelectedRecord(null)}
          record={selectedRecord.record}
          locName={location.name}
          docName={selectedRecord.doc.name}
          role={role}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
};

const ReportMatrixView = ({ records, year, docs, locations, audits }) => {
  const [filterStatus, setFilterStatus] = useState('all'); 
  const [filterPic, setFilterPic] = useState('all');
  const [filterAudit, setFilterAudit] = useState('A1');

  const [isExporting, setIsExporting] = useState(false);
  const matrixRef = useRef(null);

  const handleDownloadJPG = async () => {
    setIsExporting(true);
    try {
      if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      await new Promise(res => setTimeout(res, 300));
      const canvas = await window.html2canvas(matrixRef.current, { scale: 2, backgroundColor: '#ffffff', logging: false });
      const image = canvas.toDataURL('image/jpeg', 0.9);
      const link = document.createElement('a');
      link.href = image;
      const auditName = audits.find(a => a.id === filterAudit)?.name || 'Audit';
      link.download = `Matrix_${auditName}_${year}.jpg`;
      link.click();
    } catch (error) {
      console.error("Gagal export JPG:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const matrix = docs.map(doc => {
    const row = { id: doc.id, name: doc.name };
    locations.forEach(loc => {
      const record = records.find(r => r.location_id === loc.id && r.document_id === doc.id && r.audit_id === filterAudit && r.year === year);
      row[loc.id] = {
        status: record?.status || 'red',
        notes: record?.notes || ''
      };
    });
    return row;
  });

  const filteredLocs = locations.filter(loc => filterPic === 'all' || loc.pic === filterPic);

  return (
    <div className="p-6 flex flex-col h-screen max-h-[100vh]">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Laporan & Summary Matriks</h2>
          <p className="text-slate-500">Pratinjau Hasil Pemeriksaan Tahun {year}</p>
        </div>
        <button 
          onClick={handleDownloadJPG}
          disabled={isExporting}
          className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center transition ${isExporting ? 'bg-slate-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white shadow-sm'}`}
        >
          <Download className="w-4 h-4 mr-2" /> {isExporting ? 'Memproses...' : 'Unduh JPG (WhatsApp)'}
        </button>
      </div>

      <div className="flex gap-4 mb-4 flex-shrink-0">
        <select value={filterPic} onChange={e => setFilterPic(e.target.value)} className="border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-700 outline-none">
          <option value="all">Semua PIC Pemeriksa</option>
          <option value="Panji">Panji</option>
          <option value="Bima">Bima</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-700 outline-none">
          <option value="all">Semua Status</option>
          <option value="pending">Hanya Perlu Perhatian (Merah & Kuning)</option>
        </select>
        <select value={filterAudit} onChange={e => setFilterAudit(e.target.value)} className="border border-blue-500 bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-900 outline-none font-bold">
          {audits.map(a => (
             <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="overflow-auto flex-1 border border-slate-200 rounded-xl shadow-sm bg-slate-50">
        <div ref={matrixRef} className="p-5 bg-white w-max min-w-full inline-block">
          
          <div className="mb-4 pb-3 border-b border-slate-100 flex justify-between items-end">
            <div>
              <h3 className="text-xl font-bold text-slate-800">Matrix Hasil {audits.find(a => a.id === filterAudit)?.name}</h3>
              <p className="text-sm text-slate-500">Tahun Audit: {year} | Diekspor pada: {new Date().toLocaleDateString('id-ID')}</p>
            </div>
            <div className="text-right text-xs text-slate-400">
              Generated by Pra-Audit System
            </div>
          </div>

          <table className="w-full text-left text-sm text-slate-600 min-w-[1000px]">
            <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="p-3 border-r border-slate-200 w-10 text-center sticky left-0 bg-slate-50 z-20">No</th>
                <th className="p-3 border-r border-slate-200 min-w-[300px] sticky left-[40px] bg-slate-50 z-20">Dokumen</th>
                {filteredLocs.map(loc => (
                  <th key={loc.id} className="p-3 text-center border-r border-slate-200 bg-slate-50 min-w-[160px]">
                    {loc.name}
                    <div className="text-[10px] font-normal text-slate-500 mt-1">{loc.pic}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, idx) => {
                const hasPending = filteredLocs.some(loc => row[loc.id].status === 'red' || row[loc.id].status === 'yellow');
                if (filterStatus === 'pending' && !hasPending) return null;

                return (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3 border-r border-slate-200 text-center sticky left-0 bg-white z-10 align-top">{idx + 1}</td>
                    <td className="p-3 border-r border-slate-200 font-medium text-slate-800 sticky left-[40px] bg-white z-10 align-top">{row.name}</td>
                    {filteredLocs.map(loc => {
                      const cellData = row[loc.id];
                      const status = cellData.status;
                      const notes = cellData.notes;
                      
                      let cellClass = "p-3 border-r border-slate-200 text-center align-top ";
                      let icon = null;
                      let noteElement = null;
                      
                      if (status === 'red') {
                        cellClass += "bg-red-50 text-red-500";
                        icon = <div className="mx-auto w-3 h-3 rounded-full bg-red-500 mb-1.5 mt-1"></div>;
                        noteElement = notes ? <div className="text-[10px] text-red-700 leading-snug mt-1 text-left bg-red-100/50 p-1.5 rounded border border-red-100">{notes}</div> : null;
                      } else if (status === 'yellow') {
                        cellClass += "bg-yellow-50 text-yellow-500";
                        icon = <div className="mx-auto w-3 h-3 rounded-full bg-yellow-400 mb-1.5 mt-1"></div>;
                        noteElement = notes ? <div className="text-[10px] text-yellow-700 leading-snug mt-1 text-left bg-yellow-100/50 p-1.5 rounded border border-yellow-200">{notes}</div> : null;
                      } else {
                        cellClass += "bg-green-50 text-green-500";
                        icon = <CheckCircle className="w-4 h-4 mx-auto text-green-500 mb-1.5 mt-0.5" />;
                        noteElement = notes ? <div className="text-[10px] text-green-700 leading-snug mt-1 text-left bg-green-100/50 p-1.5 rounded border border-green-200">{notes}</div> : null;
                      }

                      return (
                        <td key={loc.id} className={cellClass}>
                          <div className="flex flex-col items-center">
                             {icon}
                             {noteElement}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          <div className="mt-6 pt-4 border-t border-slate-100 flex gap-6 text-xs text-slate-500 flex-shrink-0">
            <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div> Belum Mengisi</div>
            <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-yellow-400 mr-2"></div> Perlu Perbaikan</div>
            <div className="flex items-center"><CheckCircle className="w-4 h-4 text-green-500 mr-2" /> Sesuai</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- KOMPONEN: MANAJEMEN PENGGUNA ---
const UserManagementView = ({ users, locations, onAddUser }) => {
  return (
    <div className="p-6 flex flex-col h-screen max-h-[100vh]">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Pengaturan Akun</h2>
          <p className="text-slate-500">Kelola hak akses Auditor Pusat dan Auditee Cabang</p>
        </div>
        <button 
          onClick={onAddUser}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center shadow-sm transition"
        >
          <Plus className="w-4 h-4 mr-2" /> Tambah Pengguna Baru
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-4 w-12 text-center">No</th>
              <th className="p-4">Nama Lengkap</th>
              <th className="p-4">Username</th>
              <th className="p-4">Peran (Role)</th>
              <th className="p-4">Akses Cabang / Lokasi</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, idx) => {
              const loc = locations.find(l => l.id === u.location_id);
              return (
                <tr key={u.username} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-4 text-center">{idx + 1}</td>
                  <td className="p-4 font-medium text-slate-800 flex items-center">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center mr-3 text-slate-600">
                      <User className="w-4 h-4" />
                    </div>
                    {u.name}
                  </td>
                  <td className="p-4 text-slate-500 font-medium">{u.username}</td>
                  <td className="p-4">
                    {u.role === 'auditor' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">Auditor Pusat</span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">Auditee Cabang</span>
                    )}
                  </td>
                  <td className="p-4 text-slate-500">
                    {u.role === 'auditor' ? <span className="italic text-slate-400">Semua Akses (Full Access)</span> : (loc ? <span className="font-semibold text-slate-700">{loc.name}</span> : '-')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null); 
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedLocId, setSelectedLocId] = useState(null);
  const [selectedAuditId, setSelectedAuditId] = useState(null);
  const [expandedMenu, setExpandedMenu] = useState('A1'); 
  const [selectedYear, setSelectedYear] = useState(2026);
  
  const role = currentUser?.role || 'auditee'; 
  
  const [audits, setAudits] = useState([]);
  const [locations, setLocations] = useState([]);
  const [docs, setDocs] = useState([]);
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);

  const API_URL = 'http://localhost:5000/api';

  useEffect(() => {
    axios.get(`${API_URL}/init-data`).then(res => {
      setAudits(res.data.audits);
      setLocations(res.data.locations);
      setDocs(res.data.docs);
      setUsers(res.data.users);
    });
  }, []);

  useEffect(() => {
    axios.get(`${API_URL}/records?year=${selectedYear}`).then(res => {
      setRecords(res.data.records);
    });
  }, [selectedYear]);
 

  const [modalType, setModalType] = useState(null); 
  const [formData, setFormData] = useState({ id: null, name: '', pic: '', username: '', password: '', role: 'auditee', location_id: '', location_name: '' });
  const [modalError, setModalError] = useState('');
  
  // State Baru untuk Aksi Sidebar, Pencarian & Notifikasi
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);

  // Hitung Notifikasi (Dokumen yang "Perlu Perbaikan")
  const notifications = useMemo(() => {
    let notifs = records.filter(r => r.year === selectedYear && r.status === 'yellow');
    if (role === 'auditee' && currentUser?.location_id) {
        notifs = notifs.filter(r => r.location_id === currentUser.location_id);
    }
    return notifs.map(r => {
        const audit = audits.find(a => a.id === r.audit_id);
        const loc = locations.find(l => l.id === r.location_id);
        const doc = docs.find(d => d.id === r.document_id);
        return { ...r, auditName: audit?.name, locName: loc?.name, docName: doc?.name };
    });
  }, [records, selectedYear, role, currentUser, audits, locations, docs]);

  // Efek untuk Mengecek Link Akses Cepat (Guest Link)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#access=')) {
      const [aId, lId] = hash.replace('#access=', '').split('-');
      const numLId = parseInt(lId, 10);
      const targetLoc = MOCK_LOCATIONS.find(l => l.id === numLId);
      if (targetLoc) {
         setCurrentUser({
           username: `guest_${numLId}`,
           role: 'auditee',
           location_id: numLId,
           name: `Akses Tamu (${targetLoc.name})`
         });
         setSelectedAuditId(aId);
         setSelectedLocId(numLId);
         setExpandedMenu(aId);
         setActiveTab('location');
      }
      window.location.hash = ''; // Bersihkan hash agar tidak tersangkut
    }
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'auditee') {
      setActiveTab('location');
      setSelectedAuditId(prev => prev ? prev : 'A1');
      setSelectedLocId(prev => prev ? prev : currentUser.location_id);
      setExpandedMenu(prev => prev ? prev : 'A1');
    } else if (currentUser?.role === 'auditor') {
      setActiveTab('dashboard');
    }
  }, [currentUser]);

  // Efek Auto-close Toast Notifikasi
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast(prev => ({ ...prev, show: false }));
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
  };

  const handleShareLink = (auditId, locId) => {
    const baseUrl = window.location.href.split('#')[0];
    const shareUrl = `${baseUrl}#access=${auditId}-${locId}`;
    
    const copyToClipboard = (text) => {
      if (navigator.clipboard && window.isSecureContext) {
          return navigator.clipboard.writeText(text);
      } else {
          let textArea = document.createElement("textarea");
          textArea.value = text;
          textArea.style.position = "fixed";
          textArea.style.left = "-999999px";
          textArea.style.top = "-999999px";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          return new Promise((res, rej) => {
              document.execCommand('copy') ? res() : rej();
              textArea.remove();
          });
      }
    };

    copyToClipboard(shareUrl)
      .then(() => showToast("Tautan akses auditee berhasil disalin!", "success"))
      .catch(() => showToast("Gagal menyalin tautan. Silakan salin manual.", "warning"));
  };

  const handleUpdateRecord = async (updatedRecord) => {
    try {
      await axios.post('http://localhost:5000/api/records', updatedRecord);
    } catch (err) {
      showToast("Gagal menyimpan ke server", "warning");
    }
    setRecords(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));
    showToast("Perubahan dokumen berhasil disimpan!", "success");
  };

  const currentLoc = locations.find(l => l.id === selectedLocId);
  const currentAudit = audits.find(a => a.id === selectedAuditId);

  // Fungsi Simulasi Download Seluruh Dokumen dalam Program Audit
  const handleDownloadAllFiles = (audit) => {
    let auditRecords = records.filter(r => r.audit_id === audit.id && r.year === selectedYear);
    
    // Jika sebagai Auditee, batasi hanya mengunduh dokumen di lokasinya sendiri
    if (role === 'auditee') {
      auditRecords = auditRecords.filter(r => r.location_id === currentUser.location_id);
    }

    const allFiles = [];
    auditRecords.forEach(rec => {
      if (rec.files && rec.files.length > 0) {
        rec.files.forEach(f => {
          const doc = docs.find(d => d.id === rec.document_id);
          const loc = locations.find(l => l.id === rec.location_id);
          allFiles.push({
            fileName: f.name,
            document: doc?.name || 'Dokumen Tidak Diketahui',
            location: loc?.name || 'Cabang Tidak Diketahui',
            isRevised: f.isRevised ? 'Ya (Revisi Terbaru)' : 'Tidak'
          });
        });
      }
    });

    if (allFiles.length === 0) {
      showToast("Tidak ditemukan file dokumen apa pun dalam program audit ini untuk diunduh.", "warning");
      return;
    }

    showToast(`Menyiapkan paket download (${allFiles.length} berkas)...`, "info");

    // Membuat manifest file teks simulasi ZIP
    setTimeout(() => {
      let content = `===================================================================\n`;
      content += `PAKET ZIP SIMULASI - UNDUH SELURUH BERKAS PROGRAM AUDIT\n`;
      content += `Nama Program : ${audit.name.toUpperCase()}\n`;
      content += `Tahun Audit  : ${selectedYear}\n`;
      content += `Diunduh Oleh : ${currentUser.name} (${role === 'auditor' ? 'Auditor Pusat' : 'Auditee Cabang'})\n`;
      content += `Waktu Unduh  : ${new Date().toLocaleString('id-ID')}\n`;
      content += `===================================================================\n\n`;
      content += `Daftar Berkas Terlampir:\n\n`;

      allFiles.forEach((file, index) => {
        content += `${index + 1}. [${file.location}] — ${file.document}\n`;
        content += `   Nama Berkas : ${file.fileName}\n`;
        content += `   File Revisi : ${file.isRevised}\n`;
        content += `   -------------------------------------------------------------\n`;
      });

      content += `\n[Simulasi] Seluruh file fisik biner asli di atas telah berhasil dipaketkan dan diunduh ke komputer Anda.`;

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const downloadLink = document.createElement('a');
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = `Paket_Berkas_${audit.name.replace(/\s+/g, '_')}_${selectedYear}.txt`;
      downloadLink.click();

      showToast(`Paket berkas "${audit.name}" berhasil diunduh!`, "success");
    }, 1200);
  };

  // Fungsi Salin (Duplikasi) Cabang / Lokasi
  const handleCopyLocation = (loc) => {
    const newLocId = locations.length > 0 ? Math.max(...locations.map(l => l.id)) + 1 : 1;
    const newLocName = `${loc.name} (Copy)`;
    const newLoc = { ...loc, id: newLocId, name: newLocName };
    setLocations(prev => [...prev, newLoc]);
    
    // Buat record kosong untuk cabang baru di semua program audit & dokumen
    const newRecords = [];
    audits.forEach(audit => {
      docs.forEach(doc => {
        newRecords.push({ id: `${audit.id}-${newLocId}-${doc.id}-${selectedYear}`, audit_id: audit.id, location_id: newLocId, document_id: doc.id, year: selectedYear, status: 'red', notes: '', files: [], updated_at: null });
      });
    });
    setRecords(prev => [...prev, ...newRecords]);
    showToast(`Cabang "${newLocName}" berhasil disalin!`, "success");
  };

  // Fungsi Salin (Duplikasi) Dokumen
  const handleCopyDoc = (doc) => {
    const newDocId = `D${Date.now().toString().slice(-4)}`; // Generate ID unik sementara
    const newDocName = `${doc.name} (Copy)`;
    const newDoc = { ...doc, id: newDocId, name: newDocName };
    setDocs(prev => [...prev, newDoc]);

    // Buat record kosong untuk dokumen baru di semua cabang & audit
    const newRecords = [];
    audits.forEach(audit => {
      locations.forEach(loc => {
        newRecords.push({ id: `${audit.id}-${loc.id}-${newDocId}-${selectedYear}`, audit_id: audit.id, location_id: loc.id, document_id: newDocId, year: selectedYear, status: 'red', notes: '', files: [], updated_at: null });
      });
    });
    setRecords(prev => [...prev, ...newRecords]);
    showToast(`Dokumen "${newDocName}" berhasil disalin!`, "success");
  };

  const handleSaveModalData = async () => {
    setModalError('');
    // Validasi input berdasarkan tipe modal
    if (modalType === 'user') {
      if (!formData.name || !formData.username || !formData.password) {
        return setModalError("Pastikan Nama, Username, dan Password terisi semua!");
      }
      if (formData.role === 'auditee' && !formData.location_name) {
        return setModalError("Akses Entitas / Cabang harus diisi untuk Auditee!");
      }
    } else {
      if (!formData.name) return;
    }

    if (modalType === 'edit_location') {
      await axios.put(`http://localhost:5000/api/locations/${formData.id}`, { name: formData.name, pic: formData.pic });
      setLocations(prev => prev.map(loc => loc.id === formData.id ? { ...loc, name: formData.name, pic: formData.pic } : loc));
      showToast("Data cabang berhasil diperbarui!", "success");
    } else if (modalType === 'edit_doc') {
      await axios.put(`http://localhost:5000/api/documents/${formData.id}`, { name: formData.name });
      setDocs(prev => prev.map(d => d.id === formData.id ? { ...d, name: formData.name } : d));
      showToast("Nama dokumen berhasil diperbarui!", "success");
    } else if (modalType === 'user') {
      let assignedLocId = null;

      if (formData.role === 'auditee') {
        const existingLoc = locations.find(l => l.name.toLowerCase() === formData.location_name.toLowerCase());
        
        if (existingLoc) {
          assignedLocId = existingLoc.id;
        } else {
          const newLocId = locations.length > 0 ? Math.max(...locations.map(l => l.id)) + 1 : 1;
          const newLoc = { id: newLocId, name: formData.location_name, pic: formData.name };
          setLocations(prev => [...prev, newLoc]);
          
          const newRecords = [];
          audits.forEach(audit => {
            docs.forEach(doc => {
              newRecords.push({ id: `${audit.id}-${newLocId}-${doc.id}-${selectedYear}`, audit_id: audit.id, location_id: newLocId, document_id: doc.id, year: selectedYear, status: 'red', notes: '', files: [], updated_at: null });
            });
          });
          setRecords(prev => [...prev, ...newRecords]);
          assignedLocId = newLocId;
        }
      }

      const res = await axios.post('http://localhost:5000/api/users', { name: formData.name, username: formData.username, password: formData.password, role: formData.role, location_id: assignedLocId });
      const newUser = { id: res.data.id,
        name: formData.name,
        username: formData.username,
        password: formData.password,
        role: formData.role,
        location_id: assignedLocId
      };
      setUsers(prev => [...prev, newUser]);
      showToast(`Akun pengguna "${formData.name}" berhasil dibuat!`, "success");
    } else if (modalType === 'audit') {
      const newAudit = { id: `A${audits.length + 1}`, name: formData.name };
      await axios.post('http://localhost:5000/api/audits', { id: newAudit.id, name: formData.name });
      setAudits(prev => [...prev, newAudit]);
      const newRecords = [];
      locations.forEach(loc => {
        docs.forEach(doc => {
          newRecords.push({ id: `${newAudit.id}-${loc.id}-${doc.id}-${selectedYear}`, audit_id: newAudit.id, location_id: loc.id, document_id: doc.id, year: selectedYear, status: 'red', notes: '', files: [], updated_at: null });
        });
      });
      setRecords(prev => [...prev, ...newRecords]);
      showToast(`Program audit "${formData.name}" berhasil didaftarkan!`, "success");
    } else if (modalType === 'location') {
      const res = await axios.post('http://localhost:5000/api/locations', { name: formData.name, pic: formData.pic });
      const newLoc = { id: res.data.id, name: formData.name, pic: formData.pic || 'Belum Ditentukan' };
      setLocations(prev => [...prev, newLoc]);
      const newRecords = [];
      audits.forEach(audit => {
        docs.forEach(doc => {
          newRecords.push({ id: `${audit.id}-${newLoc.id}-${doc.id}-${selectedYear}`, audit_id: audit.id, location_id: newLoc.id, document_id: doc.id, year: selectedYear, status: 'red', notes: '', files: [], updated_at: null });
        });
      });
      setRecords(prev => [...prev, ...newRecords]);
      showToast(`Cabang "${formData.name}" berhasil ditambahkan!`, "success");
    } else if (modalType === 'doc') {
      const newDoc = { id: `D${String(docs.length + 1).padStart(2, '0')}`, name: formData.name };
      await axios.post('http://localhost:5000/api/documents', { id: newDoc.id, name: formData.name });
      setDocs(prev => [...prev, newDoc]);
      const newRecords = [];
      audits.forEach(audit => {
        locations.forEach(loc => {
          newRecords.push({ id: `${audit.id}-${loc.id}-${newDoc.id}-${selectedYear}`, audit_id: audit.id, location_id: loc.id, document_id: newDoc.id, year: selectedYear, status: 'red', notes: '', files: [], updated_at: null });
        });
      });
      setRecords(prev => [...prev, ...newRecords]);
      showToast(`Kebutuhan dokumen "${formData.name}" berhasil diterapkan!`, "success");
    }

    setModalType(null);
    setFormData({ id: null, name: '', pic: '', username: '', password: '', role: 'auditee', location_id: '', location_name: '' });
  };

  if (!currentUser) {
    return <LoginScreen users={users} onLogin={setCurrentUser} />;
  }

  const visibleLocations = role === 'auditor' ? locations : locations.filter(loc => loc.id === currentUser.location_id);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden relative">
      
      {/* Floating Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-900 text-white px-4 py-3.5 rounded-xl shadow-2xl border border-slate-800 transition-all duration-300 transform translate-y-0 animate-bounce">
          {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />}
          {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />}
          {toast.type === 'info' && <Clock className="w-5 h-5 text-blue-400 flex-shrink-0" />}
          <span className="text-sm font-semibold tracking-wide">{toast.message}</span>
          <button onClick={() => setToast(prev => ({ ...prev, show: false }))} className="text-slate-400 hover:text-white ml-2 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col flex-shrink-0 z-30 shadow-xl">
        <div className="p-4 flex items-center gap-3 border-b border-slate-800 bg-slate-950">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg">PA</div>
          <div>
            <div className="font-bold text-white leading-tight">Pra-Audit</div>
            <div className="text-xs text-blue-400">Document System</div>
          </div>
        </div>

        {/* User Profile Summary */}
        <div className="px-4 py-4 border-b border-slate-800 flex items-center gap-3 bg-slate-900/50">
          <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
            <User className="w-5 h-5"/>
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-white truncate">{currentUser.name}</p>
            <p className="text-xs text-blue-400 font-medium capitalize">{currentUser.role === 'auditor' ? 'Pusat (Full Access)' : 'Auditee Cabang'}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4 hide-scrollbar">
          <nav className="space-y-1 px-2">
            {role === 'auditor' && (
              <button 
                onClick={() => { setActiveTab('dashboard'); setSelectedLocId(null); setSelectedAuditId(null); }}
                className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-blue-600/10 text-blue-400' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <Home className="w-5 h-5 mr-3" /> Dashboard
              </button>
            )}
            
            <button 
              onClick={() => { setActiveTab('report'); setSelectedLocId(null); setSelectedAuditId(null); }}
              className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'report' ? 'bg-blue-600/10 text-blue-400' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <BarChart2 className="w-5 h-5 mr-3" /> Matrix Hasil
            </button>
            
            <div className="mt-6 mb-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider flex justify-between items-center">
              <span>Program Audit</span>
              {role === 'auditor' && (
                <button onClick={() => setModalType('audit')} className="p-1 hover:bg-slate-800 hover:text-white rounded transition-colors" title="Tambah Program Baru">
                  <Plus className="w-3.5 h-3.5"/>
                </button>
              )}
            </div>

            {audits.map(audit => {
              const totalAuditRevisions = records.filter(r => r.audit_id === audit.id && r.year === selectedYear && r.status === 'yellow').length;

              return (
              <div key={audit.id} className="mb-1">
                {/* Diganti menjadi DIV agar memiliki trigger hover tombol aksi */}
                <div 
                  onClick={() => setExpandedMenu(expandedMenu === audit.id ? null : audit.id)}
                  className={`group relative w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${expandedMenu === audit.id ? 'bg-slate-800/80 text-white' : 'hover:bg-slate-800 hover:text-white text-slate-300'}`}
                >
                  <div className="flex items-center min-w-0 flex-1">
                    <Folder className={`w-4 h-4 mr-3 flex-shrink-0 ${expandedMenu === audit.id ? 'text-blue-400' : 'text-slate-500'}`} /> 
                    <span className="truncate text-left pr-1.5">{audit.name}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {totalAuditRevisions > 0 && expandedMenu !== audit.id && (
                      <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)] animate-pulse" title={`${totalAuditRevisions} dokumen perlu review`}></div>
                    )}
                    
                    {/* Panel Aksi Hover Sidebar untuk Program Audit */}
                    <div className="hidden group-hover:flex items-center gap-1 bg-slate-900 border border-slate-700/60 p-0.5 rounded shadow-lg">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadAllFiles(audit);
                        }}
                        className="p-1 text-slate-400 hover:text-green-400 hover:bg-slate-800 rounded transition-colors"
                        title="Unduh Semua Berkas Dokumen"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {role === 'auditor' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(audit);
                            setModalType('delete_audit_confirm');
                          }}
                          className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                          title="Hapus Program Audit"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${expandedMenu === audit.id ? 'rotate-90 text-blue-400' : 'text-slate-500'}`} />
                  </div>
                </div>
                
                <div className={`overflow-hidden transition-all duration-300 ${expandedMenu === audit.id ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                  {visibleLocations.map(loc => {
                    const isSelected = activeTab === 'location' && selectedAuditId === audit.id && selectedLocId === loc.id;
                    const locRevisionsCount = records.filter(r => r.location_id === loc.id && r.audit_id === audit.id && r.year === selectedYear && r.status === 'yellow').length;

                    return (
                      <div 
                        key={loc.id}
                        onClick={() => { setActiveTab('location'); setSelectedAuditId(audit.id); setSelectedLocId(loc.id); }}
                        className={`group w-full flex items-center justify-between pl-10 pr-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${isSelected ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 font-normal hover:bg-slate-800/50 hover:text-white'}`}
                      >
                        <div className="flex items-center overflow-hidden mr-2">
                          <div className={`w-1.5 h-1.5 rounded-full mr-3 flex-shrink-0 ${isSelected ? 'bg-blue-500' : 'bg-slate-600'}`}></div>
                          <span className="truncate text-left">{loc.name}</span>
                        </div>
                        
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {locRevisionsCount > 0 && (
                            <span 
                              className="bg-yellow-500/20 text-yellow-500 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-yellow-500/30 flex-shrink-0" 
                              title={`${locRevisionsCount} dokumen perlu direview/direvisi`}
                            >
                              {locRevisionsCount}
                            </span>
                          )}
                          
                          {/* Panel Aksi Hover Sidebar untuk Cabang */}
                          <div className="hidden group-hover:flex items-center gap-0.5 bg-slate-900 border border-slate-700/60 p-0.5 rounded shadow-lg z-10">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShareLink(audit.id, loc.id);
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition"
                              title="Bagikan Tautan Akses"
                            >
                              <LinkIcon className="w-3.5 h-3.5" />
                            </button>
                            
                            {role === 'auditor' && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormData({ id: loc.id, name: loc.name, pic: loc.pic });
                                    setModalType('edit_location');
                                  }}
                                  className="p-1 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition"
                                  title="Edit Cabang"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyLocation(loc);
                                  }}
                                  className="p-1 text-slate-400 hover:text-green-400 hover:bg-slate-800 rounded transition"
                                  title="Salin / Duplikasi Cabang"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteTarget(loc);
                                    setModalType('delete_location_confirm');
                                  }}
                                  className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition"
                                  title="Hapus Cabang"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {role === 'auditor' && (
                    <button 
                      onClick={() => setModalType('location')}
                      className="w-full flex items-center pl-10 pr-3 py-2 mt-1 rounded-lg text-sm text-blue-400 hover:bg-slate-800/50 hover:text-blue-300 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 mr-2" /> Tambah Cabang
                    </button>
                  )}
                </div>
              </div>
            )})}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800">
          {role === 'auditor' && (
            <button 
              onClick={() => { setActiveTab('users'); setSelectedLocId(null); setSelectedAuditId(null); }}
              className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-blue-600/10 text-blue-400' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Settings className="w-5 h-5 mr-3" /> Pengaturan Akun
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 shadow-sm z-20">
          <div className="flex items-center gap-4">
             <div className="flex items-center text-sm font-medium text-slate-600">
               <Clock className="w-4 h-4 mr-2 text-slate-400" /> Tahun Audit:
               <select 
                 value={selectedYear} 
                 onChange={e => setSelectedYear(Number(e.target.value))}
                 className="ml-2 bg-slate-100 border border-slate-200 rounded px-2 py-1 text-slate-800 font-bold outline-none cursor-pointer"
               >
                 <option value={2025}>2025</option>
                 <option value={2026}>2026</option>
               </select>
             </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Cari dokumen..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 text-sm bg-slate-100 border-none rounded-full w-64 focus:ring-2 focus:ring-blue-500 outline-none transition" 
              />
            </div>
            
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-slate-400 hover:bg-slate-100 rounded-full transition"
                title="Notifikasi"
              >
                <Bell className="w-5 h-5" />
                {notifications.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full shadow-sm animate-pulse"></span>}
              </button>
              
              {/* Dropdown Notifikasi */}
              {showNotifications && (
                 <div className="absolute right-0 mt-3 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                   <div className="p-3 border-b border-slate-100 bg-slate-50 font-semibold text-slate-700 flex justify-between items-center">
                     Notifikasi ({notifications.length})
                     <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600 bg-slate-200/50 hover:bg-slate-200 rounded p-1 transition"><X className="w-4 h-4"/></button>
                   </div>
                   <div className="max-h-80 overflow-y-auto">
                     {notifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-500">Tidak ada notifikasi perbaikan dokumen saat ini.</div>
                     ) : (
                        notifications.map(notif => (
                           <div 
                             key={notif.id} 
                             className="p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition"
                             onClick={() => {
                                setSelectedAuditId(notif.audit_id);
                                setSelectedLocId(notif.location_id);
                                setExpandedMenu(notif.audit_id);
                                setActiveTab('location');
                                setShowNotifications(false);
                                setSearchQuery(''); // Kosongkan pencarian saat menavigasi ke dokumen
                             }}
                           >
                             <div className="text-[10px] font-bold text-yellow-600 mb-1 flex items-center uppercase tracking-wider">
                               <AlertTriangle className="w-3 h-3 mr-1"/> Perlu Perbaikan
                             </div>
                             <div className="text-sm font-semibold text-slate-800 leading-tight">{notif.docName}</div>
                             <div className="text-xs text-slate-500 mt-1 flex items-center"><Folder className="w-3 h-3 mr-1"/> {notif.auditName} — {notif.locName}</div>
                             {notif.notes && <div className="text-xs text-slate-600 mt-2 bg-yellow-50 p-1.5 rounded border border-yellow-100 truncate">Catatan: {notif.notes}</div>}
                           </div>
                        ))
                     )}
                   </div>
                 </div>
              )}
            </div>
            
            {/* Logout Button */}
            <div className="flex items-center border-l border-slate-200 pl-4 ml-2">
              <button 
                onClick={() => setCurrentUser(null)}
                className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-red-600 transition"
                title="Keluar Akun"
              >
                <LogOut className="w-4 h-4"/>
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-slate-50/50">
          {activeTab === 'dashboard' && <DashboardView records={records.filter(r => r.year === selectedYear)} audits={audits} locations={locations} docs={docs} />}
          {activeTab === 'report' && <ReportMatrixView records={records} year={selectedYear} audits={audits} locations={locations} docs={docs} />}
          {activeTab === 'users' && role === 'auditor' && <UserManagementView users={users} locations={locations} onAddUser={() => setModalType('user')} />}
          {activeTab === 'location' && currentLoc && currentAudit && (
            <LocationView 
              location={currentLoc} 
              audit={currentAudit}
              year={selectedYear} 
              records={records} 
              role={role}
              onUpdate={handleUpdateRecord}
              docs={docs}
              searchQuery={searchQuery}
              onAddDoc={() => setModalType('doc')}
              onDeleteDoc={(doc) => { setDeleteTarget(doc); setModalType('delete_doc_confirm'); }}
              onEditDoc={(doc) => { setFormData({ id: doc.id, name: doc.name }); setModalType('edit_doc'); }}
              onCopyDoc={handleCopyDoc}
              onEditLoc={(loc) => { 
                setFormData({ id: loc.id, name: loc.name, pic: loc.pic }); 
                setModalType('edit_location'); 
              }}
            />
          )}
        </div>
      </main>

      <SimpleModal 
        isOpen={!!modalType} 
        onClose={() => { setModalType(null); setModalError(''); setFormData({id: null, name:'', pic:'', username:'', password:'', role:'auditee', location_id:'', location_name:''}); }}
        title={
          modalType === 'audit' ? 'Tambah Program Audit Baru' :
          modalType === 'location' ? 'Tambah Lokasi / Cabang Baru' :
          modalType === 'edit_location' ? 'Edit Data Cabang' :
          modalType === 'edit_doc' ? 'Edit Nama Dokumen' :
          modalType === 'user' ? 'Tambah Pengguna Baru' :
          modalType === 'delete_audit_confirm' ? 'Hapus Program Audit' :
          modalType === 'delete_location_confirm' ? 'Hapus Cabang / Lokasi' :
          modalType === 'delete_doc_confirm' ? 'Hapus Kebutuhan Dokumen' :
          'Tambah Kebutuhan Dokumen'
        }
      >
        <div className="space-y-4">
          {modalError && (
             <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center border border-red-200">
               <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" /> {modalError}
             </div>
          )}

          {modalType === 'delete_audit_confirm' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                Apakah Anda yakin ingin menghapus program audit <strong className="text-slate-900">"{deleteTarget?.name}"</strong>? 
                Seluruh data status pengisian dokumen, catatan auditor, serta berkas lampiran di semua lokasi cabang untuk program ini akan dihapus secara permanen.
              </p>
              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <button 
                  onClick={() => { setModalType(null); setDeleteTarget(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Batal
                </button>
                <button 
                  onClick={async () => {
                    if (deleteTarget) {
                      await axios.delete(`http://localhost:5000/api/audits/${deleteTarget.id}`);
                      setAudits(prev => prev.filter(a => a.id !== deleteTarget.id));
                      setRecords(prev => prev.filter(r => r.audit_id !== deleteTarget.id));
                      showToast(`Program audit "${deleteTarget.name}" berhasil dihapus.`, "success");
                      if (selectedAuditId === deleteTarget.id) {
                        setSelectedAuditId(null);
                        setSelectedLocId(null);
                        setActiveTab('dashboard');
                      }
                    }
                    setModalType(null);
                    setDeleteTarget(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition shadow-sm"
                >
                  Ya, Hapus Permanen
                </button>
              </div>
            </div>
          ) : modalType === 'delete_location_confirm' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                Apakah Anda yakin ingin menghapus cabang <strong className="text-slate-900">"{deleteTarget?.name}"</strong>? 
                Seluruh profil cabang dan riwayat pengisian dokumen di tempat ini akan dihapus secara permanen.
              </p>
              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <button 
                  onClick={() => { setModalType(null); setDeleteTarget(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Batal
                </button>
                <button 
                  onClick={async () => {
                    if (deleteTarget) {
                      await axios.delete(`http://localhost:5000/api/locations/${deleteTarget.id}`);
                      setLocations(prev => prev.filter(l => l.id !== deleteTarget.id));
                      setRecords(prev => prev.filter(r => r.location_id !== deleteTarget.id));
                      showToast(`Cabang "${deleteTarget.name}" berhasil dihapus.`, "success");
                      if (selectedLocId === deleteTarget.id) {
                        setSelectedLocId(null);
                        setActiveTab('dashboard');
                      }
                    }
                    setModalType(null);
                    setDeleteTarget(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition shadow-sm"
                >
                  Ya, Hapus Cabang
                </button>
              </div>
            </div>
          ) : modalType === 'delete_doc_confirm' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                Apakah Anda yakin ingin menghapus format master dokumen <strong className="text-slate-900">"{deleteTarget?.name}"</strong>? 
                Kebutuhan dokumen ini akan dihapus dari seluruh cabang beserta file yang sudah diunggah.
              </p>
              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <button 
                  onClick={() => { setModalType(null); setDeleteTarget(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Batal
                </button>
                <button 
                  onClick={async () => {
                    if (deleteTarget) {
                      await axios.delete(`http://localhost:5000/api/documents/${deleteTarget.id}`);
                      setDocs(prev => prev.filter(d => d.id !== deleteTarget.id));
                      setRecords(prev => prev.filter(r => r.document_id !== deleteTarget.id));
                      showToast(`Dokumen master "${deleteTarget.name}" berhasil dihapus.`, "success");
                    }
                    setModalType(null);
                    setDeleteTarget(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition shadow-sm"
                >
                  Ya, Hapus Dokumen
                </button>
              </div>
            </div>
          ) : modalType === 'user' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap Pengguna</label>
                <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Contoh: Budi Santoso" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Username Login</label>
                  <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} placeholder="Contoh: budi123" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <input type="password" className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="••••••" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Peran (Role) Sistem</label>
                <select className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value, location_name: ''})}>
                  <option value="auditee">Auditee Entitas / Cabang (Unggah Saja)</option>
                  <option value="auditor">Auditor Pusat (Admin Full Access)</option>
                </select>
              </div>
              {formData.role === 'auditee' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Akses Entitas / Cabang</label>
                  <input 
                    type="text" 
                    list="location-options"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                    placeholder="Ketik nama entitas baru atau pilih..." 
                    value={formData.location_name} 
                    onChange={e => setFormData({...formData, location_name: e.target.value})}
                  />
                  <datalist id="location-options">
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.name} />
                    ))}
                  </datalist>
                  <p className="text-xs text-slate-500 mt-1">Sistem akan otomatis mendaftarkan profil entitas jika belum ada.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nama {modalType === 'audit' ? 'Program Audit' : modalType === 'location' || modalType === 'edit_location' ? 'Cabang' : modalType === 'edit_doc' ? 'Dokumen' : 'Dokumen'}
                </label>
                <input 
                  type="text" 
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder={`Masukkan nama ${modalType === 'location' || modalType === 'edit_location' ? 'cabang' : modalType === 'edit_doc' ? 'dokumen' : 'data'}...`}
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  autoFocus
                />
              </div>
              
              {(modalType === 'location' || modalType === 'edit_location') && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nama PIC (Penanggung Jawab)</label>
                  <input 
                    type="text" 
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Masukkan nama PIC..."
                    value={formData.pic}
                    onChange={e => setFormData({...formData, pic: e.target.value})}
                  />
                </div>
              )}
            </>
          )}

          {/* Menghindari rendering footer ganda jika bertipe modal delete */}
          {!modalType?.startsWith('delete_') && (
            <div className="pt-4 flex justify-end gap-2">
              <button 
                onClick={() => { setModalType(null); setModalError(''); setFormData({id: null, name:'', pic:'', username:'', password:'', role:'auditee', location_id:'', location_name:''}); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                Batal
              </button>
              <button 
                onClick={handleSaveModalData}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
              >
                Simpan Data
              </button>
            </div>
          )}
        </div>
      </SimpleModal>

    </div>
  );
}