import React, { useState, useRef, useEffect } from 'react';
import { X, FileSpreadsheet, Play, CheckCircle2, AlertTriangle, ChevronRight, HelpCircle } from 'lucide-react';
import { api } from '../lib/api';

interface CSVMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

const CLIENT_FIELDS = [
  { key: 'name', label: 'Nombre / Razón Social *', required: true },
  { key: 'categoria', label: 'Categoría (Productor/Acopio/etc.)', required: false },
  { key: 'tipoCliente', label: 'Tipo de Cliente (Prospecto/etc.)', required: false },
  { key: 'zona', label: 'Zona / Ubicación', required: false },
  { key: 'cuit', label: 'CUIT', required: false },
  { key: 'phone', label: 'Teléfono', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'hectareasPropias', label: 'Hectáreas Propias', required: false },
  { key: 'hectareasAlquiladas', label: 'Hectáreas Alquiladas', required: false },
  { key: 'precioObjetivoSoja', label: 'Precio Obj Soja (USD)', required: false },
  { key: 'precioObjetivoMaiz', label: 'Precio Obj Maíz (USD)', required: false },
  { key: 'precioObjetivoTrigo', label: 'Precio Obj Trigo (USD)', required: false },
  { key: 'precioObjetivoSorgo', label: 'Precio Obj Sorgo (USD)', required: false },
  { key: 'precioObjetivoGirasol', label: 'Precio Obj Girasol (USD)', required: false },
  { key: 'status', label: 'Estado (Activo/etc.)', required: false },
  { key: 'relevado', label: 'Relevado (Sí/No)', required: false }
];

export function CSVMappingModal({ isOpen, onClose, onImportComplete }: CSVMappingModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Select, 2: Map & Preview, 3: Progress
  
  // Import progress states
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset state on close
      setFile(null);
      setHeaders([]);
      setRows([]);
      setMapping({});
      setStep(1);
      setIsImporting(false);
      setProgress(0);
      setSuccessCount(0);
      setErrorCount(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return { headers: [], rows: [] };

    // Detect delimiter: count commas vs semicolons in header
    const firstLine = lines[0];
    const commas = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    const delimiter = commas >= semicolons ? ',' : ';';

    const parseLine = (line: string) => {
      const result: string[] = [];
      let start = 0;
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
          inQuotes = !inQuotes;
        } else if (line[i] === delimiter && !inQuotes) {
          result.push(line.slice(start, i).replace(/^"|"$/g, '').trim());
          start = i + 1;
        }
      }
      result.push(line.slice(start).replace(/^"|"$/g, '').trim());
      return result;
    };

    const headers = parseLine(lines[0]);
    const parsedRows: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        parsedRows.push(parseLine(line));
      }
    }
    return { headers, rows: parsedRows };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        const { headers: csvHeaders, rows: csvRows } = parseCSV(text);
        setHeaders(csvHeaders);
        setRows(csvRows);
        
        // Auto-match headers to fields case-insensitively
        const initialMapping: Record<string, string> = {};
        CLIENT_FIELDS.forEach(field => {
          const matched = csvHeaders.find(h => {
            const hClean = h.toLowerCase().trim();
            const keyClean = field.key.toLowerCase();
            const labelClean = field.label.toLowerCase();
            
            // Loose similarity mapping
            return hClean === keyClean ||
                   hClean === labelClean ||
                   labelClean.includes(hClean) ||
                   hClean.includes(keyClean) ||
                   (field.key === 'name' && (hClean.includes('nombre') || hClean.includes('razon') || hClean.includes('social'))) ||
                   (field.key === 'phone' && (hClean.includes('tel') || hClean.includes('cel') || hClean.includes('contacto'))) ||
                   (field.key === 'zona' && (hClean.includes('localidad') || hClean.includes('provincia') || hClean.includes('ubicacion')));
          });
          initialMapping[field.key] = matched || '';
        });
        
        setMapping(initialMapping);
        setStep(2);
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleMappingChange = (fieldKey: string, headerName: string) => {
    setMapping(prev => ({
      ...prev,
      [fieldKey]: headerName
    }));
  };

  const getMappedPreviewRow = (rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row) return null;

    const preview: Record<string, string> = {};
    CLIENT_FIELDS.forEach(field => {
      const headerName = mapping[field.key];
      if (headerName) {
        const headerIdx = headers.indexOf(headerName);
        preview[field.key] = row[headerIdx] || '';
      } else {
        preview[field.key] = '-';
      }
    });
    return preview;
  };

  const startImport = async () => {
    // Validation
    const nameMapping = mapping['name'];
    if (!nameMapping) {
      alert('Debe asignar obligatoriamente una columna de CSV al campo "Nombre / Razón Social"');
      return;
    }

    setStep(3);
    setIsImporting(true);
    setProgress(0);
    setSuccessCount(0);
    setErrorCount(0);

    const total = rows.length;
    for (let i = 0; i < total; i++) {
      const row = rows[i];
      const clientPayload: Record<string, any> = {};

      CLIENT_FIELDS.forEach(field => {
        const headerName = mapping[field.key];
        if (headerName) {
          const headerIdx = headers.indexOf(headerName);
          let val: any = row[headerIdx];
          
          if (val !== undefined && val !== null) {
            val = val.trim();
            // Convert numbers
            if (['hectareasPropias', 'hectareasAlquiladas', 'precioObjetivoSoja', 'precioObjetivoMaiz', 'precioObjetivoTrigo', 'precioObjetivoSorgo', 'precioObjetivoGirasol'].includes(field.key)) {
              val = parseFloat(val) || null;
            }
            clientPayload[field.key] = val;
          }
        }
      });

      // Inject default campaign variables required by server schema validation
      clientPayload.anoFiscal = clientPayload.anoFiscal || 'FY2425';
      clientPayload.status = clientPayload.status || 'activo';
      clientPayload.relevado = clientPayload.relevado || 'No';

      try {
        await api.clients.create(clientPayload);
        setSuccessCount(prev => prev + 1);
      } catch (err) {
        console.error('Row import error:', err, clientPayload);
        setErrorCount(prev => prev + 1);
      }

      setProgress(Math.round(((i + 1) / total) * 100));
    }

    setIsImporting(false);
    onImportComplete();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-[#1c1c1c] border border-zinc-800 rounded-t-3xl sm:rounded-3xl max-w-4xl w-full max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-slide-up sm:animate-scale-up pb-safe sm:pb-0">
        
        {/* Mobile Grab Bar */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center bg-zinc-900">
          <div className="w-12 h-1 bg-zinc-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="p-4 sm:p-6 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-2 sm:p-3 bg-green-500/10 border border-green-500/20 text-green-500 rounded-2xl shrink-0">
              <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-lg font-black text-white tracking-tight truncate">Importador de CSV</h3>
              <p className="text-[10px] sm:text-xs text-zinc-400 truncate">Mapea columnas personalizadas al CRM</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            disabled={isImporting}
            className="p-1.5 sm:p-2 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          
          {/* STEP 1: Select CSV */}
          {step === 1 && (
            <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-zinc-800 rounded-3xl bg-zinc-900/25 space-y-4 hover:border-green-500/50 transition-all duration-300">
              <div className="p-6 bg-zinc-800/80 rounded-full border border-zinc-700">
                <FileSpreadsheet className="w-12 h-12 text-zinc-400" />
              </div>
              <div className="text-center space-y-1">
                <h4 className="font-bold text-white text-base">Selecciona un archivo CSV</h4>
                <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">Soporta archivos separados por comas (,) o punto y coma (;) con cabeceras.</p>
              </div>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange}
                accept=".csv"
                className="hidden" 
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-black font-black text-xs rounded-xl shadow-lg hover:shadow-green-500/10 active:scale-95 transition-all duration-150 uppercase tracking-wider cursor-pointer"
              >
                Buscar Archivo
              </button>
            </div>
          )}

          {/* STEP 2: Mapping Configurations */}
          {step === 2 && (
            <div className="space-y-6">
              
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <h4 className="font-bold text-sm text-white mb-3 flex items-center gap-1.5">
                  <span>🗺️</span> 1. Mapeo de Campos de Base de Datos
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {CLIENT_FIELDS.map(field => {
                    const mappedVal = mapping[field.key] || '';
                    return (
                      <div key={field.key} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-zinc-850 rounded-xl border border-zinc-800 gap-3">
                        <span className="text-xs font-semibold text-zinc-200">
                          {field.label}
                        </span>
                        
                        <select
                          value={mappedVal}
                          onChange={(e) => handleMappingChange(field.key, e.target.value)}
                          className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-green-500 max-w-xs w-full cursor-pointer"
                        >
                          <option value="">-- No Importar --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Data Preview */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 overflow-hidden">
                <h4 className="font-bold text-sm text-white mb-3 flex items-center gap-1.5">
                  <span>👁️</span> 2. Vista Previa de Registros Mapeados
                </h4>
                <div className="overflow-x-auto rounded-xl border border-zinc-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-zinc-800 text-zinc-400 font-semibold border-b border-zinc-700">
                        {CLIENT_FIELDS.filter(f => mapping[f.key]).map(f => (
                          <th key={f.key} className="p-3 whitespace-nowrap">{f.label.replace('*', '').trim()}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {[0, 1, 2].map(rowIdx => {
                        const previewRow = getMappedPreviewRow(rowIdx);
                        if (!previewRow) return null;
                        return (
                          <tr key={rowIdx} className="hover:bg-zinc-850 transition">
                            {CLIENT_FIELDS.filter(f => mapping[f.key]).map(f => (
                              <td key={f.key} className="p-3 text-zinc-350 whitespace-nowrap truncate max-w-[200px]">
                                {previewRow[f.key] || '-'}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* STEP 3: Progress and Stats */}
          {step === 3 && (
            <div className="p-8 space-y-6 flex flex-col items-center justify-center text-center">
              
              {isImporting ? (
                <div className="space-y-4 w-full max-w-md">
                  <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
                    <span className="w-16 h-16 rounded-full border-4 border-green-500/20 border-t-green-500 animate-spin" />
                    <span className="absolute text-xs font-mono font-black text-white">{progress}%</span>
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="font-bold text-white">Importando base de datos...</h4>
                    <p className="text-xs text-zinc-400">Procesando {rows.length} filas en lote por favor espere</p>
                  </div>
                  
                  {/* Progress bar container */}
                  <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden border border-zinc-750">
                    <div className="bg-green-500 h-full rounded-full transition-all duration-150" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-w-sm">
                  <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 rounded-full w-fit mx-auto">
                    <CheckCircle2 className="w-12 h-12" />
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="font-bold text-white text-base">Importación Completada</h4>
                    <p className="text-xs text-zinc-400">El archivo CSV se procesó completamente.</p>
                  </div>
                </div>
              )}

              {/* Stats Cards */}
              <div className="grid grid-cols-2 gap-4 max-w-md w-full pt-4">
                <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-center">
                  <p className="text-xs text-zinc-550 uppercase font-black tracking-wide">Importados</p>
                  <p className="text-3xl font-black text-green-400 font-mono mt-1">{successCount}</p>
                </div>
                <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-center">
                  <p className="text-xs text-zinc-550 uppercase font-black tracking-wide">Errores</p>
                  <p className="text-3xl font-black text-red-400 font-mono mt-1">{errorCount}</p>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        {step !== 3 && (
          <div className="p-6 bg-zinc-900 border-t border-zinc-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 border border-zinc-700 transition cursor-pointer"
            >
              Cancelar
            </button>
            {step === 2 && (
              <button
                type="button"
                onClick={startImport}
                className="px-5 py-2 text-xs font-black rounded-xl bg-green-600 hover:bg-green-700 text-black shadow-lg hover:shadow-green-500/10 active:scale-95 transition flex items-center gap-1.5 uppercase tracking-wider cursor-pointer"
              >
                <span>Procesar Lote ({rows.length})</span>
                <Play className="w-3.5 h-3.5 fill-black stroke-none" />
              </button>
            )}
          </div>
        )}
        
        {step === 3 && !isImporting && (
          <div className="p-6 bg-zinc-900 border-t border-zinc-800 flex justify-center">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-xs font-black rounded-xl bg-green-600 hover:bg-green-700 text-black shadow-lg active:scale-95 transition uppercase tracking-wider cursor-pointer"
            >
              Finalizar
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
