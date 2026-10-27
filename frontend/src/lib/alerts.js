import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import { toast } from 'sonner';

const base = Swal.mixin({
  buttonsStyling: false,
  reverseButtons: true,
  focusCancel: false,
  showClass: { popup: 'swal2-show' },
  customClass: {
    popup: 'exc-swal',
    container: 'exc-swal-backdrop',
    confirmButton: 'btn btn--primary',
    cancelButton: 'btn btn--ghost',
    denyButton: 'btn btn--danger',
  },
  cancelButtonText: 'Cancelar',
});

export async function confirm({ title, text, confirmText = 'Confirmar', danger = false, icon = 'question' }) {
  const r = await base.fire({
    title, text, icon, showCancelButton: true, confirmButtonText: confirmText,
    customClass: { popup: 'exc-swal', container: 'exc-swal-backdrop', confirmButton: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, cancelButton: 'btn btn--ghost' },
    iconColor: danger ? '#b4233c' : '#0e6b58',
  });
  return r.isConfirmed;
}

export async function promptText({ title, text, placeholder = 'Escribe el motivo…', confirmText = 'Confirmar', danger = false, min = 5, optional = false, inputValue = '' }) {
  const r = await base.fire({
    title, text, input: 'textarea', inputPlaceholder: placeholder, inputValue, showCancelButton: true, confirmButtonText: confirmText,
    customClass: { popup: 'exc-swal', container: 'exc-swal-backdrop', confirmButton: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, cancelButton: 'btn btn--ghost' },
    inputValidator: (v) => (!optional && (!v || v.trim().length < min) ? `Escribe al menos ${min} caracteres.` : undefined),
  });
  return r.isConfirmed ? (r.value || '').trim() : null;
}

export function success(title, text) {
  return base.fire({ title, text, icon: 'success', iconColor: '#0e6b58', confirmButtonText: 'Entendido', timer: 4200, timerProgressBar: true });
}

export function failure(title, text) {
  return base.fire({ title, text, icon: 'error', iconColor: '#b4233c', confirmButtonText: 'Entendido' });
}

export function info(title, html) {
  return base.fire({ title, html, icon: 'info', iconColor: '#2a5fa8', confirmButtonText: 'Entendido' });
}

export function apiError(err, fallback = 'No se pudo completar la acción.') {
  const msg = err?.message || fallback;
  if (err?.status >= 500 || err?.code === 'SERVICE_UNAVAILABLE') return failure('Algo salió mal', msg);
  toast.error(msg);
}

export { toast };
