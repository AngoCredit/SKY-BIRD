import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Upload,
  Camera,
  CreditCard,
  Phone,
  CheckCircle,
  AlertCircle,
  Clock,
  ChevronRight,
  ChevronLeft,
  Eye,
  XCircle,
  RefreshCw,
  Sun,
  Video
} from 'lucide-react';
import { store } from '../../services/store';
import { audioManager } from '../../services/audioManager';
import { VerificationRequest } from '../../types';

interface KYCVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingRequest: VerificationRequest | null;
}

type Step = 1 | 2 | 3 | 4;

export const KYCVerificationModal: React.FC<KYCVerificationModalProps> = ({
  isOpen,
  onClose,
  existingRequest
}) => {
  const [step, setStep] = useState<Step>(1);
  const [idDocumentImage, setIdDocumentImage] = useState<string>('');
  const [selfieImage, setSelfieImage] = useState<string>('');
  const [airtmAccount, setAirtmAccount] = useState<string>('');
  const [whatsappNumber, setWhatsappNumber] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Camera Live State for Step 2 (Selfie)
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const idDocRef = useRef<HTMLInputElement>(null);
  const selfieFileRef = useRef<HTMLInputElement>(null);

  // Stop video stream cleanup helper
  const stopCameraStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  // Clean camera stream on unmount or modal close or step change
  useEffect(() => {
    if (!isOpen || step !== 2) {
      stopCameraStream();
    }
  }, [isOpen, step, stopCameraStream]);

  // Start live webcam camera with enhanced brightness & stream initialization
  const startCamera = async () => {
    setCameraError(null);
    setError(null);
    setIsCameraActive(true);

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: false
        });
      } catch {
        // Fallback constraint if high-res fails
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      mediaStreamRef.current = stream;

      // Small delay to ensure React has mounted the <video> ref element
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(console.warn);
          };
        }
      }, 50);

      audioManager.playButtonClick();
    } catch (err) {
      console.warn('Erro ao aceder à câmara:', err);
      setIsCameraActive(false);
      setCameraError('Não foi possível aceder à câmara em tempo real. Certifique-se de conceder a permissão de câmara no seu navegador.');
    }
  };

  // Capture frame from live camera stream safely without crashing
  const captureSelfieFromCamera = () => {
    try {
      if (!videoRef.current) return;
      const video = videoRef.current;

      const width = video.videoWidth || video.clientWidth || 640;
      const height = video.videoHeight || video.clientHeight || 480;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Flip horizontally if front camera for natural selfie look
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      // 1. Stop video stream tracks cleanly first
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      setIsCameraActive(false);

      // 2. Set image preview state
      if (dataUrl && dataUrl.length > 100) {
        setSelfieImage(dataUrl);
        try {
          audioManager.playNotification();
        } catch {
          // ignore sound error if audio context is blocked
        }
      }
    } catch (err) {
      console.error('Erro ao capturar fotografia:', err);
      setCameraError('Erro ao capturar a foto. Por favor, tente novamente.');
    }
  };

  const readFileAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const resultStr = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          } else {
            resolve(resultStr);
          }
        };
        img.onerror = () => resolve(resultStr);
        img.src = resultStr;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const handleIdDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('O arquivo não pode ser maior que 5 MB.');
      return;
    }
    setError(null);
    const base64 = await readFileAsBase64(file);
    setIdDocumentImage(base64);
    audioManager.playButtonClick();
  };

  const handleSelfieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('O arquivo não pode ser maior que 5 MB.');
      return;
    }
    setError(null);
    const base64 = await readFileAsBase64(file);
    setSelfieImage(base64);
    stopCameraStream();
    audioManager.playButtonClick();
  };

  const canAdvanceStep = (): boolean => {
    if (step === 1) return idDocumentImage !== '';
    if (step === 2) return selfieImage !== '';
    if (step === 3) return airtmAccount.trim().length >= 4 && whatsappNumber.trim().length >= 8;
    return false;
  };

  const handleNext = () => {
    if (!canAdvanceStep()) return;
    setError(null);
    stopCameraStream();
    audioManager.playButtonClick();
    setStep((prev) => Math.min(4, prev + 1) as Step);
  };

  const handleBack = () => {
    stopCameraStream();
    audioManager.playButtonClick();
    setStep((prev) => Math.max(1, prev - 1) as Step);
  };

  const handleSubmit = () => {
    setError(null);
    if (!idDocumentImage || !selfieImage || !airtmAccount.trim() || !whatsappNumber.trim()) {
      setError('Por favor, preencha todos os campos antes de enviar.');
      return;
    }
    setIsSubmitting(true);
    audioManager.playButtonClick();

    setTimeout(() => {
      store.submitVerificationRequest({
        idDocumentImage,
        selfieImage,
        airtmAccount,
        whatsappNumber
      });
      setIsSubmitting(false);
      setSubmitted(true);
      audioManager.playNotification();
    }, 1200);
  };

  if (!isOpen) return null;

  const steps = [
    { num: 1, label: 'Documento', icon: CreditCard },
    { num: 2, label: 'Selfie Ao Vivo', icon: Camera },
    { num: 3, label: 'Conta Airtm', icon: Phone },
    { num: 4, label: 'Revisão', icon: Eye }
  ];

  const isRejected = existingRequest?.status === 'rejected';
  const isPending = existingRequest?.status === 'pending' && !submitted;
  const isApproved = existingRequest?.status === 'approved';

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-slate-900 border border-cyan-500/30 rounded-3xl shadow-2xl shadow-cyan-950/60 relative">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-cyber font-bold text-white tracking-wide">
                VERIFICAÇÃO DE IDENTIDADE (KYC)
              </h3>
              <p className="text-xs text-slate-400">
                Aumente seu limite de saque para $500.00 USD/dia
              </p>
            </div>
          </div>
          <button
            id="btn-close-kyc"
            onClick={() => { stopCameraStream(); onClose(); }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {/* --- ALREADY APPROVED --- */}
          {isApproved && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto animate-pulse">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-cyber font-bold text-white">Conta Verificada!</h4>
              <p className="text-sm text-slate-400">Sua identidade foi confirmada e seu limite de saque já é de $500.00 USD/dia.</p>
              <button onClick={onClose} className="mt-4 px-8 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-cyber font-bold text-sm cursor-pointer transition">
                FECHAR
              </button>
            </div>
          )}

          {/* --- PENDING (waiting admin review) --- */}
          {isPending && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto animate-pulse">
                <Clock className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-cyber font-bold text-white">Verificação em Análise</h4>
              <p className="text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
                Seus documentos foram enviados e estão sendo analisados pelo nosso time. Você receberá uma notificação assim que o processo for concluído.
              </p>
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-left space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Submetido em:</span>
                  <span className="text-white">{new Date(existingRequest!.submittedAt).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Airtm:</span>
                  <span className="text-cyan-400">{existingRequest!.airtmAccount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">WhatsApp:</span>
                  <span className="text-emerald-400">{existingRequest!.whatsappNumber}</span>
                </div>
              </div>
              <button onClick={onClose} className="mt-2 px-8 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-cyber font-bold text-sm cursor-pointer transition">
                FECHAR
              </button>
            </div>
          )}

          {/* --- SUBMITTED (just now) --- */}
          {submitted && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 mx-auto animate-bounce">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-cyber font-bold text-white">Documentos Enviados!</h4>
              <p className="text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
                Sua solicitação de verificação foi recebida com sucesso. Nossa equipa irá analisar em breve.
              </p>
              <button onClick={onClose} className="mt-2 px-8 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-cyber font-bold text-sm cursor-pointer transition">
                CONCLUIR
              </button>
            </div>
          )}

          {/* --- MAIN FORM (new or after rejection) --- */}
          {!isApproved && !isPending && !submitted && (
            <>
              {/* Rejection banner */}
              {isRejected && (
                <div className="mb-5 p-4 rounded-2xl bg-rose-950/50 border border-rose-500/40 flex items-start gap-3 text-xs">
                  <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-rose-300 font-bold mb-0.5">Verificação Anterior Recusada</p>
                    <p className="text-rose-400/80">{existingRequest?.rejectionReason || 'Documentos inválidos ou ilegíveis.'}</p>
                    <p className="text-slate-400 mt-1">Por favor, envie novos documentos válidos.</p>
                  </div>
                </div>
              )}

              {/* Progress bar */}
              <div className="flex items-center gap-0 mb-6">
                {steps.map((s, idx) => {
                  const Icon = s.icon;
                  const isActive = step === s.num;
                  const isDone = step > s.num;
                  return (
                    <React.Fragment key={s.num}>
                      <div className="flex flex-col items-center gap-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                          isDone ? 'bg-emerald-500 text-slate-950' :
                          isActive ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/40' :
                          'bg-slate-800 text-slate-500'
                        }`}>
                          {isDone ? '✓' : <Icon className="w-4 h-4" />}
                        </div>
                        <span className={`text-[10px] font-semibold ${isActive ? 'text-cyan-400' : isDone ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {s.label}
                        </span>
                      </div>
                      {idx < steps.length - 1 && (
                        <div className={`flex-1 h-0.5 mb-4 transition-all duration-300 ${step > s.num ? 'bg-emerald-500' : 'bg-slate-800'}`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* STEP 1: ID Document */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                    <p className="font-bold text-white mb-1 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-cyan-400" />
                      Passo 1 — Foto do Documento de Identidade
                    </p>
                    <p className="text-slate-400">
                      Tire uma foto clara do seu <strong className="text-white">Bilhete de Identidade, Passaporte ou CNH</strong>. O documento deve estar visível, sem reflexos ou cortes.
                    </p>
                  </div>

                  <div
                    onClick={() => idDocRef.current?.click()}
                    className={`relative w-full h-52 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 overflow-hidden ${
                      idDocumentImage
                        ? 'border-emerald-500/60 bg-emerald-950/20'
                        : 'border-slate-700 hover:border-cyan-500/50 bg-slate-950/40 hover:bg-cyan-950/10'
                    }`}
                  >
                    {idDocumentImage ? (
                      <>
                        <img src={idDocumentImage} alt="Document" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                          <span className="text-white font-semibold text-sm">Clique para alterar</span>
                        </div>
                        <div className="absolute top-3 right-3 bg-emerald-500 rounded-full p-1.5">
                          <CheckCircle className="w-4 h-4 text-slate-950" />
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload className="w-10 h-10 text-slate-600" />
                        <div className="text-center">
                          <p className="text-sm text-slate-300 font-semibold">Clique para fazer upload do documento</p>
                          <p className="text-xs text-slate-500">JPG, PNG ou PDF • Máx 5 MB</p>
                        </div>
                      </>
                    )}
                  </div>
                  <input ref={idDocRef} type="file" accept="image/*,application/pdf" onChange={handleIdDocumentUpload} className="hidden" />
                </div>
              )}

              {/* STEP 2: Selfie em Tempo Real */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                    <p className="font-bold text-white mb-1 flex items-center gap-2">
                      <Camera className="w-4 h-4 text-cyan-400" />
                      Passo 2 — Selfie em Tempo Real com o Documento
                    </p>
                    <p className="text-slate-400">
                      Tire uma selfie <strong className="text-white">em tempo real segurando o documento de identidade</strong> ao lado do rosto. Certifique-se de que está num local bem iluminado e que tanto o rosto quanto o documento estejam perfeitamente nítidos.
                    </p>
                    <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-amber-300/90 font-mono">
                      <span className="flex items-center gap-1">
                        <Sun className="w-3.5 h-3.5 text-amber-400" /> Boa Iluminação
                      </span>
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Imagem Nítida
                      </span>
                      <span className="flex items-center gap-1">
                        <Video className="w-3.5 h-3.5 text-cyan-400" /> Tempo Real
                      </span>
                    </div>
                  </div>

                  {/* Camera view or Captured photo preview */}
                  {selfieImage ? (
                    <div className="space-y-3">
                      <div className="relative w-full h-64 rounded-2xl border-2 border-emerald-500/60 bg-slate-950 overflow-hidden shadow-xl">
                        <img src={selfieImage} alt="Selfie Capturada" className="w-full h-full object-cover" />
                        <div className="absolute top-3 right-3 bg-emerald-500 rounded-full p-1.5 shadow-lg">
                          <CheckCircle className="w-5 h-5 text-slate-950" />
                        </div>
                        <div className="absolute bottom-3 left-3 bg-slate-950/80 border border-emerald-500/40 rounded-xl px-3 py-1 text-xs text-emerald-400 font-mono">
                          ✓ Foto Capturada em Tempo Real
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelfieImage('');
                          startCamera();
                        }}
                        className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Tirar Nova Foto em Tempo Real
                      </button>
                    </div>
                  ) : isCameraActive ? (
                    <div className="space-y-3">
                      {/* Video Container with Screen Ring Light Booster for low-light environments */}
                      <div className="relative w-full h-72 rounded-2xl border-4 border-cyan-400/80 bg-slate-950 overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.4)]">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover transform -scale-x-100 filter brightness-105 contrast-105"
                        />
                        {/* Soft white screen illumination border overlay */}
                        <div className="absolute inset-0 border-[12px] border-white/20 pointer-events-none rounded-2xl" />

                        {/* Live face & ID card positioning frame overlay */}
                        <div className="absolute inset-0 border-2 border-dashed border-cyan-300/60 rounded-2xl pointer-events-none flex flex-col justify-between p-4">
                          <div className="flex justify-between items-center text-[10px] font-mono text-cyan-300 bg-slate-950/90 px-3 py-1 rounded-full border border-cyan-500/40 w-fit backdrop-blur-md">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping mr-1.5" />
                            Câmara em Tempo Real (Iluminação Ativa)
                          </div>
                          <div className="text-center text-xs font-semibold text-white bg-slate-950/85 py-2 px-4 rounded-xl border border-cyan-500/30 backdrop-blur-md mx-auto shadow-lg">
                            💡 Ilumine bem o ambiente e posicione o Rosto + Documento
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={captureSelfieFromCamera}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-cyber font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/30 transition"
                      >
                        <Camera className="w-5 h-5" />
                        CAPTURAR FOTO EM TEMPO REAL
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-full h-56 rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950/40 flex flex-col items-center justify-center p-6 text-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg">
                          <Camera className="w-7 h-7" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white mb-1">Selfie em Tempo Real Obrigatória</p>
                          <p className="text-xs text-slate-400 max-w-xs mx-auto">
                            Para garantir a segurança, a selfie deve ser tirada diretamente com a câmara do seu dispositivo.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={startCamera}
                          className="w-full max-w-md py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-cyber font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-cyan-500/25 transition mt-1"
                        >
                          <Video className="w-4 h-4" />
                          ABRIR CÂMARA EM TEMPO REAL
                        </button>
                      </div>

                      {cameraError && (
                        <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-800 text-amber-300 text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                          <span>{cameraError}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: Airtm + WhatsApp */}
              {step === 3 && (
                <div className="space-y-5">
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                    <p className="font-bold text-white mb-1 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-cyan-400" />
                      Passo 3 — Informações de Contacto e Saque
                    </p>
                    <p className="text-slate-400">
                      Forneça a sua conta Airtm para receber saques e o seu número de WhatsApp para contacto de suporte.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                        Conta Airtm (email ou username)
                      </label>
                      <input
                        type="text"
                        value={airtmAccount}
                        onChange={(e) => setAirtmAccount(e.target.value)}
                        placeholder="seuemail@exemplo.com ou @username"
                        className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-sm focus:border-cyan-500 outline-none transition font-mono"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">Esta conta será usada exclusivamente para receber seus saques.</p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                        Número de WhatsApp (com código do país)
                      </label>
                      <input
                        type="tel"
                        value={whatsappNumber}
                        onChange={(e) => setWhatsappNumber(e.target.value)}
                        placeholder="+244 921 234 567"
                        className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-sm focus:border-emerald-500 outline-none transition font-mono"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">Número para contacto do suporte via WhatsApp.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: Review */}
              {step === 4 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 text-center mb-2">Revise as informações antes de enviar.</p>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Doc preview */}
                    <div className="space-y-1">
                      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Documento de Identidade</p>
                      <div
                        className="w-full h-32 rounded-xl overflow-hidden border border-slate-700 cursor-pointer relative group"
                        onClick={() => setPreviewImage(idDocumentImage)}
                      >
                        <img src={idDocumentImage} alt="Doc" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <Eye className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    </div>

                    {/* Selfie preview */}
                    <div className="space-y-1">
                      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Selfie (Tempo Real)</p>
                      <div
                        className="w-full h-32 rounded-xl overflow-hidden border border-slate-700 cursor-pointer relative group"
                        onClick={() => setPreviewImage(selfieImage)}
                      >
                        <img src={selfieImage} alt="Selfie" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <Eye className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs font-mono">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-slate-400">Conta Airtm:</span>
                      <strong className="text-cyan-400">{airtmAccount}</strong>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-slate-400">WhatsApp:</span>
                      <strong className="text-emerald-400">{whatsappNumber}</strong>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <span>
                      Ao submeter, declaro que os documentos são autênticos e as informações fornecidas são verídicas. Documentos falsos resultam em suspensão permanente da conta.
                    </span>
                  </div>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="mt-3 p-3 rounded-xl bg-red-950/80 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Navigation buttons */}
              <div className="flex items-center gap-3 mt-5 pt-4 border-t border-slate-800">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Voltar
                  </button>
                )}

                {step < 4 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!canAdvanceStep()}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-cyber font-bold text-sm uppercase tracking-wider transition cursor-pointer disabled:opacity-40 shadow-lg shadow-cyan-500/25"
                  >
                    Próximo Passo
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-cyber font-bold text-sm uppercase tracking-wider transition cursor-pointer disabled:opacity-50 shadow-lg shadow-emerald-500/25"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-950/60 border-t-slate-950 rounded-full animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        ENVIAR VERIFICAÇÃO
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Image preview lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <img src={previewImage} alt="Preview" className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl" />
          <button className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
