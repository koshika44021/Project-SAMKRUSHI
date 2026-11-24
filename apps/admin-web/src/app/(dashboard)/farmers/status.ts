import type { SupplierStatus } from '@samkrushi/shared';

export function statusTone(status: SupplierStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'active':
      return 'success';
    case 'pending_verification':
      return 'warning';
    case 'suspended':
      return 'danger';
    default:
      return 'neutral';
  }
}
