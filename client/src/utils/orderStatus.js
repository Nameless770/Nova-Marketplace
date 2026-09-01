// Customer-facing wording for the order lifecycle. Kept out of the component
// file so fast refresh keeps working there.
export const ORDER_STATUS_LABELS = {
  // Payment is cash on delivery, so nothing is ever waiting on a card: an order
  // that has not been confirmed yet is simply placed.
  pending: 'Placed',
  confirmed: 'Confirmed',
  processing: 'Preparing',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

// The happy path a shopper follows. Cancelled and refunded orders leave this
// path, so they are reported separately rather than shown as a step.
export const ORDER_STAGES = [
  { key: 'confirmed', label: 'Confirmed', blurb: 'Payment received' },
  { key: 'processing', label: 'Preparing', blurb: 'Seller is packing it' },
  { key: 'shipped', label: 'Shipped', blurb: 'On its way' },
  { key: 'out_for_delivery', label: 'Out for delivery', blurb: 'With the courier' },
  { key: 'delivered', label: 'Delivered', blurb: 'Handed over' },
]
