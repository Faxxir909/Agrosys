import React, { useState, useEffect } from 'react';
import { X, Send, Plus, Trash2, HelpCircle, AlertCircle, Sparkles, MessageSquare } from 'lucide-react';
import { api } from '../lib/api';
import { useUI } from '../contexts/UIContext';

interface WhatsappTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  phone: string;
  clientId: string;
  clientName: string;
  contextVars?: {
    cropType?: string;
    quantity_tn?: number;
    price_usd?: number;
    location?: string;
  };
}

export function WhatsappTemplateModal({
  isOpen,
  onClose,
  phone,
  clientId,
  clientName,
  contextVars
}: WhatsappTemplateModalProps) {
  const { addToast } = useUI();
  
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  
  // New template states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const data = await api.whatsappTemplates.list();
      setTemplates(data);
      if (data.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(data[0].id);
        compileMessage(data[0].content);
      }
    } catch (e) {
      console.error('Error fetching templates:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  const compileMessage = (templateContent: string) => {
    let text = templateContent;
    
    // Substitute variables
    text = text.replace(/\{\{nombre\}\}/g, clientName || '(Productor)');
    text = text.replace(/\{\{grano\}\}/g, (contextVars?.cropType || 'soja').toUpperCase());
    text = text.replace(/\{\{toneladas\}\}/g, contextVars?.quantity_tn ? new Intl.NumberFormat('es-AR').format(contextVars.quantity_tn) : '(Volumen)');
    text = text.replace(/\{\{precio\}\}/g, contextVars?.price_usd ? new Intl.NumberFormat('es-AR').format(contextVars.price_usd) : '(Precio)');
    text = text.replace(/\{\{destino\}\}/g, contextVars?.location || 'A convenir');
    
    setCustomMessage(text);
  };

  useEffect(() => {
    if (selectedTemplateId) {
      const active = templates.find(t => t.id === selectedTemplateId);
      if (active) {
        compileMessage(active.content);
      }
    }
  }, [selectedTemplateId, templates, clientName, contextVars]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) {
      addToast('El productor no tiene un teléfono cargado.', 'error');
      return;
    }
    if (!customMessage.trim()) {
      addToast('El mensaje no puede estar vacío.', 'error');
      return;
    }

    setSending(true);
    try {
      await api.whatsapp.sendMessage({
        phone,
        message: customMessage,
        clientId
      });
      addToast('Mensaje de WhatsApp enviado con éxito 🚀', 'success');
      onClose();
    } catch (err: any) {
      addToast(err.message || 'Error al enviar mensaje. ¿Está conectado el QR?', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim() || !newTemplateContent.trim()) {
      addToast('Complete todos los campos de la plantilla.', 'error');
      return;
    }

    setCreatingTemplate(true);
    try {
      await api.whatsappTemplates.create({
        name: newTemplateName,
        content: newTemplateContent
      });
      addToast('Plantilla creada correctamente.', 'success');
      setNewTemplateName('');
      setNewTemplateContent('');
      setShowCreateForm(false);
      await fetchTemplates();
    } catch (e) {
      addToast('Error al crear plantilla.', 'error');
    } finally {
      setCreatingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (id.startsWith('default_')) {
      addToast('No se pueden eliminar las plantillas del sistema.', 'error');
      return;
    }
    
    try {
      await api.whatsappTemplates.delete(id);
      addToast('Plantilla eliminada.', 'success');
      if (selectedTemplateId === id) {
        setSelectedTemplateId('');
        setCustomMessage('');
      }
      await fetchTemplates();
    } catch (e) {
      addToast('Error al eliminar plantilla.', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-[#1e1e1e] border border-zinc-800 rounded-t-3xl sm:rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh] animate-slide-up sm:animate-scale-up pb-safe sm:pb-0">
        
        {/* Mobile Grab Bar */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center bg-green-600/10">
          <div className="w-12 h-1 bg-zinc-600 rounded-full" />
        </div>

        {/* Header (WhatsApp Green Theme) */}
        <div className="p-3.5 sm:p-4 bg-green-600/10 border-b border-green-600/20 flex items-center justify-between text-green-400">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-green-600 rounded-full flex items-center justify-center text-white shadow-md shrink-0">
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-xs sm:text-sm tracking-wide text-white truncate">Mensajero de WhatsApp</h3>
              <p className="text-[9px] sm:text-[10px] text-zinc-400 truncate">Notificar a <strong>{clientName}</strong> ({phone})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 sm:space-y-5 scrollbar-thin">
          {/* Create Template Form Toggle */}
          <div className="flex justify-between items-center bg-[#252525] px-4 py-3 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
              <span className="text-xs font-bold text-zinc-300">Administrador de Plantillas</span>
            </div>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="text-[10px] font-extrabold uppercase bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 border border-purple-500/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              {showCreateForm ? 'Cancelar' : 'Crear Plantilla ➕'}
            </button>
          </div>

          {/* Form Create Inline */}
          {showCreateForm && (
            <form onSubmit={handleCreateTemplate} className="p-4 bg-[#232323] border border-purple-500/10 rounded-xl space-y-3.5 shadow-inner">
              <h4 className="text-xs font-black text-purple-400 uppercase tracking-wider">Nueva Plantilla Personalizada</h4>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Ej: Aviso de Logística"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase">Cuerpo de Plantilla</label>
                  <div className="flex items-center gap-1.5 text-[9px] text-zinc-500">
                    <HelpCircle className="w-3 h-3" />
                    <span>Usa variables: {"{{nombre}}"}, {"{{grano}}"}, {"{{toneladas}}"}, {"{{precio}}"}, {"{{destino}}"}</span>
                  </div>
                </div>
                <textarea
                  required
                  rows={3}
                  value={newTemplateContent}
                  onChange={(e) => setNewTemplateContent(e.target.value)}
                  placeholder="Hola {{nombre}}, le avisamos que ..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-purple-500 font-sans leading-relaxed"
                />
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={creatingTemplate}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {creatingTemplate && <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>}
                  <span>Guardar Plantilla</span>
                </button>
              </div>
            </form>
          )}

          {/* Selector & Template Loader */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Seleccionar Plantilla</label>
            <div className="flex gap-2">
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                disabled={loading}
                className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-green-500 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-green-500 appearance-none cursor-pointer"
              >
                {loading ? (
                  <option>Cargando plantillas...</option>
                ) : templates.length === 0 ? (
                  <option>Sin plantillas disponibles</option>
                ) : (
                  templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} {t.id.startsWith('default_') ? '(Sistema)' : ''}</option>
                  ))
                )}
              </select>
              
              {selectedTemplateId && !selectedTemplateId.startsWith('default_') && (
                <button
                  onClick={(e) => handleDeleteTemplate(selectedTemplateId, e)}
                  className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl transition-colors cursor-pointer"
                  title="Eliminar plantilla actual"
                >
                  <Trash2 className="w-4.5 h-4.5" />
                </button>
              )}
            </div>
          </div>

          {/* WhatsApp Style Chat bubble preview emulator */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Vista Previa (Burbuja de WhatsApp)</label>
            <div className="bg-[#0b141a] rounded-2xl p-4 flex flex-col justify-end min-h-[120px] relative overflow-hidden border border-zinc-850 shadow-inner" style={{
              backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
              backgroundSize: 'cover',
              backgroundBlendMode: 'overlay',
              backgroundColor: 'rgba(11, 20, 26, 0.94)'
            }}>
              {/* WhatsApp Message Bubble */}
              {customMessage.trim() ? (
                <div className="bg-[#005c4b] border border-[#005c4b] rounded-t-xl rounded-bl-xl p-3 text-xs sm:text-sm text-zinc-100 font-sans max-w-[85%] self-end shadow-md leading-relaxed whitespace-pre-wrap relative animate-fade-in group/bubble">
                  {customMessage}
                  <div className="text-[9px] text-[#8696a0] text-right mt-1.5 font-mono select-none">
                    {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} ✓✓
                  </div>
                </div>
              ) : (
                <div className="text-zinc-550 text-xs italic text-center p-4 bg-black/40 border border-zinc-800 rounded-xl max-w-sm mx-auto">
                  Selecciona una plantilla o edita el mensaje abajo para simular la burbuja.
                </div>
              )}
            </div>
          </div>

          {/* Message Textarea Editor */}
          <form onSubmit={handleSend} className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Cuerpo del Mensaje (Editable)</label>
              <textarea
                rows={4}
                required
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Escribe el mensaje personalizado..."
                className="w-full bg-[#1b1b1b] border border-zinc-800 focus:border-green-500 rounded-xl p-3 text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500 leading-relaxed font-sans"
              />
            </div>
            
            <div className="bg-green-550/10 border border-green-500/20 text-zinc-350 p-3 rounded-xl flex items-start gap-2.5 text-xs leading-relaxed">
              <AlertCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <span>
                El mensaje se enviará directamente a través del bot vinculado en <strong>AgroSys</strong>. Confirma que la conexión QR se encuentra **activa** para asegurar el despacho inmediato.
              </span>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-bold rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={sending || !customMessage.trim()}
                className="px-5 py-2.5 text-xs font-black rounded-xl bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
              >
                {sending ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Enviar Notificación</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
