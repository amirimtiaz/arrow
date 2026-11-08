/**
 * Client copy of the mock branches in spacetime/ops/src/seed/branches.ts (keep the two in sync). Used only for the
 * Communications preview when the published ops module does not have the branch tables yet. All simulated.
 */

export interface ReportMetrics {
  /** On-time delivery, percent. */
  onTimePct?: number;
  /** Inventory on hand, days of cover. */
  inventoryDays?: number;
  /** Open issues the branch is tracking. */
  openIssues?: number;
}

export interface SeedBranch {
  key: string;
  department: string;
  country: string;
  state: string;
  city: string;
  /** Upper management: where reports go. */
  isHq?: boolean;
}

export interface SeedBranchMessage {
  from: string;
  /** Branch key, or '*' for every branch. */
  to: string;
  kind: 'message' | 'report';
  subject: string;
  body: string;
  metrics?: ReportMetrics;
  minutesAgo: number;
}

export interface BranchSeed {
  branches: SeedBranch[];
  messages: SeedBranchMessage[];
}

export const BRANCH_SEED: Record<string, BranchSeed> = {
  amazon: {
    branches: [
      { key: 'exec', department: 'Upper Management', country: 'United States', state: 'Washington', city: 'Seattle', isHq: true },
      { key: 'scm-dfw', department: 'Supply Chain', country: 'United States', state: 'Texas', city: 'Dallas' },
      { key: 'log-lax', department: 'Logistics', country: 'United States', state: 'California', city: 'Los Angeles' },
      { key: 'air-cvg', department: 'Air Operations', country: 'United States', state: 'Kentucky', city: 'Hebron' },
      { key: 'proc-szx', department: 'Procurement', country: 'China', state: 'Guangdong', city: 'Shenzhen' },
      { key: 'sec-sea', department: 'Security Operations', country: 'United States', state: 'Washington', city: 'Seattle' },
    ],
    messages: [
      {
        from: 'proc-szx',
        to: '*',
        kind: 'message',
        subject: '国庆黄金周运力提醒',
        body: '国庆黄金周前，深圳供应商的交货期延长了约两天。请尽早预订十月份的海运舱位。',
        minutesAgo: 190,
      },
      {
        from: 'proc-szx',
        to: 'scm-dfw',
        kind: 'message',
        subject: '第二批电子产品已确认',
        body: '工厂已确认第二批订单（约 4,800 件）将于周四在盐田港装船。质检报告已上传，请提前安排达拉斯的收货。',
        minutesAgo: 70,
      },
      {
        from: 'log-lax',
        to: 'scm-dfw',
        kind: 'message',
        subject: 'Chassis shortage at San Pedro Bay',
        body: 'Drayage is running 6 to 10 hours behind. Prioritising high-value SKUs off the next two vessels.',
        minutesAgo: 95,
      },
      {
        from: 'scm-dfw',
        to: 'exec',
        kind: 'report',
        subject: 'Weekly North America network report',
        body: 'Network healthy overall. Port drayage delays in Los Angeles are the main risk; the Grand Prairie 3PL is running at 92% utilisation.',
        metrics: { onTimePct: 94.2, inventoryDays: 31, openIssues: 4 },
        minutesAgo: 42,
      },
      {
        from: 'air-cvg',
        to: 'exec',
        kind: 'report',
        subject: 'Air hub daily summary',
        body: 'All sorts completed. Two late inbound flights recovered on the second wave.',
        metrics: { onTimePct: 97.8, inventoryDays: 4, openIssues: 1 },
        minutesAgo: 18,
      },
    ],
  },
  cvs: {
    branches: [
      { key: 'exec', department: 'Upper Management', country: 'United States', state: 'Rhode Island', city: 'Woonsocket', isHq: true },
      { key: 'scm-tx', department: 'Supply Chain', country: 'United States', state: 'Texas', city: 'Fort Worth' },
      { key: 'dist-fl', department: 'Distribution', country: 'United States', state: 'Florida', city: 'Orlando' },
      { key: 'cold-tn', department: 'Cold Chain', country: 'United States', state: 'Tennessee', city: 'Memphis' },
      { key: 'proc-in', department: 'Procurement', country: 'India', state: 'Maharashtra', city: 'Mumbai' },
      { key: 'pharm-pr', department: 'Pharmacy Operations', country: 'Puerto Rico', state: 'San Juan', city: 'San Juan' },
    ],
    messages: [
      {
        from: 'proc-in',
        to: 'scm-tx',
        kind: 'message',
        subject: 'Generic API shipment confirmed',
        body: 'Next ocean consignment of generics leaves Nhava Sheva on schedule. Documents uploaded for customs pre-clearance.',
        minutesAgo: 240,
      },
      {
        from: 'cold-tn',
        to: '*',
        kind: 'message',
        subject: 'Reefer temperature alarms',
        body: 'Two reefer units on the vaccine lane logged short excursions overnight. Product within range; units swapped this morning.',
        minutesAgo: 120,
      },
      {
        from: 'scm-tx',
        to: 'exec',
        kind: 'report',
        subject: 'Weekly pharmacy replenishment report',
        body: 'Store fill rate steady. Hurricane season staging is complete for the Florida DC; Puerto Rico lane is a day behind.',
        metrics: { onTimePct: 96.1, inventoryDays: 21, openIssues: 3 },
        minutesAgo: 35,
      },
    ],
  },
  'maple-main': {
    branches: [
      { key: 'exec', department: 'Owners & Management', country: 'United States', state: 'Texas', city: 'Richardson', isHq: true },
      { key: 'kitchen-rich', department: 'Kitchen Operations', country: 'United States', state: 'Texas', city: 'Richardson' },
      { key: 'kitchen-plano', department: 'Kitchen Operations', country: 'United States', state: 'Texas', city: 'Plano' },
      { key: 'purchasing', department: 'Purchasing', country: 'United States', state: 'Texas', city: 'Dallas' },
    ],
    messages: [
      {
        from: 'purchasing',
        to: '*',
        kind: 'message',
        subject: 'Produce prices up this week',
        body: 'Avocados and limes are up about 15% after the cold snap. Suggest swapping the special to the roasted vegetable bowl.',
        minutesAgo: 150,
      },
      {
        from: 'kitchen-plano',
        to: 'kitchen-rich',
        kind: 'message',
        subject: 'Borrowing brioche',
        body: 'Bakery delivery came up short. Can you spare two trays of brioche for tonight? We will send a runner at 4.',
        minutesAgo: 60,
      },
      {
        from: 'purchasing',
        to: 'exec',
        kind: 'report',
        subject: 'Weekly supplier report',
        body: 'All deliveries arrived; one seafood order was 40 minutes late. Food cost is 1.2 points over target because of produce.',
        metrics: { onTimePct: 91.5, inventoryDays: 3, openIssues: 2 },
        minutesAgo: 25,
      },
    ],
  },
};
