import Swal from 'sweetalert2'

export async function confirmDanger(title: string, text?: string): Promise<boolean> {
  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    confirmButtonColor: '#ef4444',
    reverseButtons: true,
  })
  return result.isConfirmed
}

export function success(title: string) {
  Swal.fire({ title, icon: 'success', timer: 1500, showConfirmButton: false })
}
