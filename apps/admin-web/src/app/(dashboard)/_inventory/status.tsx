import {
  BATCH_STATUS_LABELS,
  type BatchStatus,
  EXCEPTION_TYPE_LABELS,
  type ExceptionType,
  formatInr,
  GOODS_RECEIPT_STATUS_LABELS,
  type GoodsReceiptStatus,
  PURCHASE_ORDER_STATUS_LABELS,
  type PurchaseOrderStatus,
} from '@samkrushi/shared';
import { Badge } from '@/components/ui/primitives';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const PO_TONES: Record<PurchaseOrderStatus, Tone> = {
  draft: 'neutral',
  sent: 'info',
  partially_received: 'warning',
  received: 'success',
  cancelled: 'neutral',
};
const RECEIPT_TONES: Record<GoodsReceiptStatus, Tone> = {
  draft: 'warning',
  posted: 'success',
  cancelled: 'neutral',
};
const BATCH_TONES: Record<BatchStatus, Tone> = {
  active: 'success',
  on_hold: 'warning',
  recalled: 'danger',
  depleted: 'neutral',
};
const EXCEPTION_TONES: Record<ExceptionType, Tone> = {
  supply_shortfall: 'danger',
  reservations_returned_to_pool: 'warning',
  over_receipt: 'info',
};

export const PoStatusBadge = ({ status }: { status: PurchaseOrderStatus }) => (
  <Badge tone={PO_TONES[status]}>{PURCHASE_ORDER_STATUS_LABELS[status]}</Badge>
);
export const ReceiptStatusBadge = ({ status }: { status: GoodsReceiptStatus }) => (
  <Badge tone={RECEIPT_TONES[status]}>{GOODS_RECEIPT_STATUS_LABELS[status]}</Badge>
);
export const BatchStatusBadge = ({ status }: { status: BatchStatus }) => (
  <Badge tone={BATCH_TONES[status]}>{BATCH_STATUS_LABELS[status]}</Badge>
);
export const ExceptionTypeBadge = ({ type }: { type: ExceptionType }) => (
  <Badge tone={EXCEPTION_TONES[type]}>{EXCEPTION_TYPE_LABELS[type]}</Badge>
);

/** Agreed cost per base unit; costs are recorded per PO (no standard rates). */
export function formatUnitCost(paise: number | null, unit: string): string {
  return paise === null ? '—' : `${formatInr(paise)} / ${unit}`;
}
