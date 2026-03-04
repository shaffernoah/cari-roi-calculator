import { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtDollar(v) {
  if (v == null || !isFinite(v)) return '$0';
  const abs = Math.abs(Math.round(v));
  const formatted = abs.toLocaleString('en-US');
  return v < 0 ? `-$${formatted}` : `$${formatted}`;
}

function fmtPct(v) {
  if (v == null || !isFinite(v)) return '0.0%';
  return `${v.toFixed(1)}%`;
}

function fmtMultiple(v) {
  if (v == null || !isFinite(v) || v < 0) return '0.0x';
  return `${v.toFixed(1)}x`;
}

function fmtMonths(v) {
  if (v == null || !isFinite(v) || v < 0) return 'N/A';
  if (v > 120) return '> 10 years';
  return `${v.toFixed(1)} months`;
}

function safeDivide(a, b) {
  if (b === 0 || !isFinite(b)) return 0;
  return a / b;
}

// ─── Scenario presets ─────────────────────────────────────────────────────────

const SCENARIOS = {
  Conservative: {
    projectedDSO: 25,
    cariEarlyPct: 25,
    cariOnTimePct: 50,
    cariLatePct: 25,
    volumeLiftPct: 2,
    badDebtReductionPct: 40,
    tradeSpendReplacedPct: 35,
    cariFeeRate: 2.0,
  },
  Base: {
    projectedDSO: 18,
    cariEarlyPct: 40,
    cariOnTimePct: 45,
    cariLatePct: 15,
    volumeLiftPct: 5,
    badDebtReductionPct: 60,
    tradeSpendReplacedPct: 50,
    cariFeeRate: 2.0,
  },
  Aggressive: {
    projectedDSO: 10,
    cariEarlyPct: 55,
    cariOnTimePct: 35,
    cariLatePct: 10,
    volumeLiftPct: 8,
    badDebtReductionPct: 80,
    tradeSpendReplacedPct: 65,
    cariFeeRate: 2.0,
  },
};

// ─── Default state ────────────────────────────────────────────────────────────

const DEFAULTS = {
  // Section 1: Vendor Profile
  annualRevenue: 15000000,
  numAccounts: 200,
  avgInvoiceSize: 2500,
  invoiceFrequency: 4,
  // Section 2: Current AR & Payment Behavior
  currentDSO: 38,
  earlyPct: 10,
  onTimePct: 45,
  latePct: 45,
  badDebtPct: 1.5,
  arInsuranceCost: 25000,
  collectionsCost: 60000,
  costOfCapital: 10,
  // Section 3: Current Trade Spend
  totalTradeSpend: 400000,
  incrementalPct: 20,
  // Section 4: Cari Assumptions
  ...SCENARIOS.Base,
};

// ─── Input field component ────────────────────────────────────────────────────

function InputField({ label, value, onChange, prefix, suffix, step, min, max, tooltip }) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {tooltip && (
          <span className="ml-1 text-gray-400 cursor-help" title={tooltip}>&#9432;</span>
        )}
      </label>
      <div className="flex items-center">
        {prefix && <span className="text-sm text-gray-500 mr-1">{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '' || raw === '-') { onChange(0); return; }
            onChange(parseFloat(raw));
          }}
          step={step || 1}
          min={min}
          max={max}
          className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:border-[#2E75B6] focus:ring-1 focus:ring-[#2E75B6]"
        />
        {suffix && <span className="text-sm text-gray-500 ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

// ─── Collapsible section component ────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4 border border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-[#1B2A4A] text-white text-sm font-semibold text-left cursor-pointer"
      >
        <span>{title}</span>
        <span className="text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 py-3 bg-white">{children}</div>}
    </div>
  );
}

// ─── Waterfall chart tooltip ──────────────────────────────────────────────────

function WaterfallTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  return (
    <div className="bg-white border border-gray-300 p-2 text-sm">
      <p className="font-semibold">{data.name}</p>
      <p className={data.displayValue >= 0 ? 'text-green-700' : 'text-red-600'}>
        {fmtDollar(data.displayValue)}
      </p>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [inputs, setInputs] = useState(DEFAULTS);
  const [activeScenario, setActiveScenario] = useState('Base');
  const [copiedFlag, setCopiedFlag] = useState(false);

  const set = useCallback((key) => (val) => {
    setInputs((prev) => ({ ...prev, [key]: val }));
    setActiveScenario(null);
  }, []);

  const applyScenario = useCallback((name) => {
    setActiveScenario(name);
    setInputs((prev) => ({ ...prev, ...SCENARIOS[name] }));
  }, []);

  // ─── All calculations (spec sections A–E) ───────────────────────────────

  const calc = useMemo(() => {
    const {
      annualRevenue, numAccounts, currentDSO, projectedDSO,
      costOfCapital, badDebtPct, badDebtReductionPct,
      arInsuranceCost, collectionsCost,
      totalTradeSpend, incrementalPct, tradeSpendReplacedPct,
      volumeLiftPct, cariFeeRate,
    } = inputs;

    // A. DSO Compression Value
    // A1. Average AR balance (current): AR_current = (annual_revenue / 365) * current_DSO
    const arCurrent = safeDivide(annualRevenue, 365) * currentDSO;
    // A2. Average AR balance (with Cari): AR_cari = (annual_revenue / 365) * projected_DSO
    const arCari = safeDivide(annualRevenue, 365) * projectedDSO;
    // A3. Working capital freed: WC_freed = AR_current - AR_cari
    const wcFreed = arCurrent - arCari;
    // A4. Annual financing savings: financing_savings = WC_freed * (cost_of_capital / 100)
    const financingSavings = wcFreed * (costOfCapital / 100);
    // A5. Bad debt reduction
    //     bad_debt_current = annual_revenue * (bad_debt_pct / 100)
    //     bad_debt_savings = bad_debt_current * (bad_debt_reduction_pct / 100)
    const badDebtCurrent = annualRevenue * (badDebtPct / 100);
    const badDebtSavings = badDebtCurrent * (badDebtReductionPct / 100);
    // A6. AR insurance savings: proportional to risk reduction
    //     ar_insurance_savings = ar_insurance_cost * (bad_debt_reduction_pct / 100)
    const arInsuranceSavings = arInsuranceCost * (badDebtReductionPct / 100);
    // A7. Collections cost reduction: conservative 40% from automated payment incentives
    //     collections_savings = collections_cost * 0.40
    const collectionsSavings = collectionsCost * 0.40;
    // A8. Total DSO Value
    const dsoTotal = financingSavings + badDebtSavings + arInsuranceSavings + collectionsSavings;

    // B. Trade Spend Optimization Value
    // B1. Wasted trade spend: wasted_spend = total_trade_spend * (1 - incremental_pct / 100)
    const wastedSpend = totalTradeSpend * (1 - incrementalPct / 100);
    // B2. Trade spend redirected: redirected_spend = total_trade_spend * (trade_spend_replaced_pct / 100)
    const redirectedSpend = totalTradeSpend * (tradeSpendReplacedPct / 100);
    // B3. Savings from replacing blind spend with closed-loop
    //     spend_efficiency_gain = redirected_spend * (1 - incremental_pct / 100)
    //     (The portion that was wasted is now either saved or converted to measurable rewards)
    const spendEfficiencyGain = redirectedSpend * (1 - incrementalPct / 100);
    // B4. Incremental revenue: incremental_revenue = annual_revenue * (volume_lift_pct / 100)
    const incrementalRevenue = annualRevenue * (volumeLiftPct / 100);
    // B5. Incremental margin: assume 25% gross margin on incremental volume
    //     incremental_margin = incremental_revenue * 0.25
    const incrementalMargin = incrementalRevenue * 0.25;
    // B6. Total Trade Spend Value
    const tradeSpendTotal = spendEfficiencyGain + incrementalMargin;

    // C. Cari Platform Cost: cari_cost = annual_revenue * (cari_fee_rate / 100)
    const cariCost = annualRevenue * (cariFeeRate / 100);

    // D. Net Value
    // D1. Gross value
    const grossValue = dsoTotal + tradeSpendTotal;
    // D2. Net annual value
    const netValue = grossValue - cariCost;
    // D3. ROI multiple: gross_value / cari_cost
    const roiMultiple = safeDivide(grossValue, cariCost);
    // Payback period (months): cari_cost / (gross_value / 12)
    const monthlyGrossValue = safeDivide(grossValue, 12);
    const paybackMonths = safeDivide(cariCost, monthlyGrossValue);

    // E. Per-Account Economics
    // E1. Average value per restaurant account
    const perAccountValue = safeDivide(netValue, numAccounts);
    // E2. Average Cari cost per account
    const perAccountCost = safeDivide(cariCost, numAccounts);

    return {
      arCurrent, arCari, wcFreed,
      financingSavings, badDebtCurrent, badDebtSavings,
      arInsuranceSavings, collectionsSavings, dsoTotal,
      wastedSpend, redirectedSpend, spendEfficiencyGain,
      incrementalRevenue, incrementalMargin, tradeSpendTotal,
      cariCost, grossValue, netValue, roiMultiple, paybackMonths,
      perAccountValue, perAccountCost,
    };
  }, [inputs]);

  // ─── Chart data ──────────────────────────────────────────────────────────

  const dsoBreakdownData = [
    { name: 'Financing Savings', value: calc.financingSavings },
    { name: 'Bad Debt Savings', value: calc.badDebtSavings },
    { name: 'AR Insurance Savings', value: calc.arInsuranceSavings },
    { name: 'Collections Savings', value: calc.collectionsSavings },
  ];

  const tradeBreakdownData = [
    { name: 'Spend Efficiency Gain', value: calc.spendEfficiencyGain },
    { name: 'Incremental Margin', value: calc.incrementalMargin },
  ];

  // Waterfall: stacking gross value components, then Cari cost subtracting, then net
  const waterfallData = useMemo(() => {
    const items = [
      { name: 'Financing Savings', displayValue: calc.financingSavings },
      { name: 'Bad Debt Savings', displayValue: calc.badDebtSavings },
      { name: 'AR Insurance', displayValue: calc.arInsuranceSavings },
      { name: 'Collections', displayValue: calc.collectionsSavings },
      { name: 'Spend Efficiency', displayValue: calc.spendEfficiencyGain },
      { name: 'Incr. Margin', displayValue: calc.incrementalMargin },
      { name: 'Cari Fee', displayValue: -calc.cariCost },
      { name: 'Net Value', displayValue: calc.netValue },
    ];

    let running = 0;
    return items.map((item, i) => {
      const isLast = i === items.length - 1;
      if (isLast) {
        // Net value bar always anchored at zero
        return {
          ...item,
          invisible: calc.netValue >= 0 ? 0 : calc.netValue,
          bar: Math.abs(calc.netValue),
          isPositive: calc.netValue >= 0,
          isNet: true,
        };
      }
      const val = item.displayValue;
      if (val >= 0) {
        const base = running;
        running += val;
        return { ...item, invisible: base, bar: val, isPositive: true, isNet: false };
      } else {
        running += val;
        return { ...item, invisible: running, bar: Math.abs(val), isPositive: false, isNet: false };
      }
    });
  }, [calc]);

  // ─── Copy summary to clipboard ──────────────────────────────────────────

  const copySummary = useCallback(() => {
    const lines = [
      '════════════════════════════════════════════════════',
      '  CARI ROI ANALYSIS — VENDOR SUMMARY',
      '════════════════════════════════════════════════════',
      '',
      `Scenario: ${activeScenario || 'Custom'}`,
      `Date: ${new Date().toLocaleDateString('en-US')}`,
      '',
      '── VENDOR PROFILE ──────────────────────────────────',
      `Annual Revenue:          ${fmtDollar(inputs.annualRevenue)}`,
      `Active Accounts:         ${inputs.numAccounts}`,
      `Avg Invoice Size:        ${fmtDollar(inputs.avgInvoiceSize)}`,
      `Invoice Freq / Mo:       ${inputs.invoiceFrequency}`,
      '',
      '── CURRENT STATE ───────────────────────────────────',
      `Current DSO:             ${inputs.currentDSO} days`,
      `Bad Debt Write-Off:      ${fmtPct(inputs.badDebtPct)} of revenue`,
      `Total Trade Spend:       ${fmtDollar(inputs.totalTradeSpend)}`,
      `  Incremental %:         ${fmtPct(inputs.incrementalPct)}`,
      '',
      '── PROJECTED WITH CARI ─────────────────────────────',
      `Projected DSO:           ${inputs.projectedDSO} days`,
      `Cari Fee Rate:           ${fmtPct(inputs.cariFeeRate)}`,
      '',
      '── DSO COMPRESSION VALUE ───────────────────────────',
      `Working Capital Freed:   ${fmtDollar(calc.wcFreed)}`,
      `Financing Savings:       ${fmtDollar(calc.financingSavings)}`,
      `Bad Debt Savings:        ${fmtDollar(calc.badDebtSavings)}`,
      `AR Insurance Savings:    ${fmtDollar(calc.arInsuranceSavings)}`,
      `Collections Savings:     ${fmtDollar(calc.collectionsSavings)}`,
      `SUBTOTAL:                ${fmtDollar(calc.dsoTotal)}`,
      '',
      '── TRADE SPEND OPTIMIZATION ────────────────────────',
      `Spend Efficiency Gain:   ${fmtDollar(calc.spendEfficiencyGain)}`,
      `Incremental Margin:      ${fmtDollar(calc.incrementalMargin)}`,
      `SUBTOTAL:                ${fmtDollar(calc.tradeSpendTotal)}`,
      '',
      '── TOTAL ROI ───────────────────────────────────────',
      `Gross Annual Value:      ${fmtDollar(calc.grossValue)}`,
      `Cari Annual Cost:        ${fmtDollar(calc.cariCost)}`,
      `NET ANNUAL VALUE:        ${fmtDollar(calc.netValue)}`,
      `ROI Multiple:            ${fmtMultiple(calc.roiMultiple)}`,
      `Payback Period:          ${fmtMonths(calc.paybackMonths)}`,
      '',
      '── PER-ACCOUNT ECONOMICS ───────────────────────────',
      `Net Value / Account:     ${fmtDollar(calc.perAccountValue)}`,
      `Cari Cost / Account:     ${fmtDollar(calc.perAccountCost)}`,
      '',
      '── ASSUMPTIONS ─────────────────────────────────────',
      '  25% gross margin on incremental volume',
      '  40% collections cost reduction from automated incentives',
      '  AR insurance savings proportional to bad debt reduction',
      '',
      '════════════════════════════════════════════════════',
      '  Generated by Cari ROI Calculator',
      '════════════════════════════════════════════════════',
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedFlag(true);
      setTimeout(() => setCopiedFlag(false), 2000);
    });
  }, [inputs, calc, activeScenario]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const isNegative = calc.netValue < 0;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <header className="bg-[#1B2A4A] text-white px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Cari Vendor ROI Calculator</h1>
            <p className="text-sm text-blue-200 mt-0.5">Quantify DSO compression &amp; trade spend optimization</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {Object.keys(SCENARIOS).map((name) => (
              <button
                key={name}
                onClick={() => applyScenario(name)}
                className={`px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors ${
                  activeScenario === name
                    ? 'bg-[#2E75B6] border-[#2E75B6] text-white'
                    : 'bg-transparent border-blue-300 text-blue-200 hover:bg-[#2E75B6]/20'
                }`}
              >
                {name}
              </button>
            ))}
            <button
              onClick={copySummary}
              className="ml-3 px-3 py-1.5 text-xs font-medium border border-blue-300 text-blue-200 hover:bg-[#2E75B6]/20 cursor-pointer transition-colors"
            >
              {copiedFlag ? 'Copied!' : 'Copy Summary'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row">
        {/* ─── LEFT PANEL: Inputs ─────────────────────────────────────────── */}
        <div className="lg:w-[380px] lg:min-w-[380px] p-4 border-r border-gray-200 overflow-y-auto lg:h-[calc(100vh-72px)]">
          <Section title="1. Vendor Profile">
            <InputField
              label="Annual revenue from restaurant customers"
              value={inputs.annualRevenue}
              onChange={set('annualRevenue')}
              prefix="$"
              step={100000}
              min={0}
            />
            <InputField
              label="Number of active restaurant accounts"
              value={inputs.numAccounts}
              onChange={set('numAccounts')}
              step={1}
              min={1}
            />
            <InputField
              label="Average invoice size"
              value={inputs.avgInvoiceSize}
              onChange={set('avgInvoiceSize')}
              prefix="$"
              step={100}
              min={0}
            />
            <InputField
              label="Invoice frequency per customer per month"
              value={inputs.invoiceFrequency}
              onChange={set('invoiceFrequency')}
              step={1}
              min={1}
            />
          </Section>

          <Section title="2. Current AR & Payment Behavior">
            <InputField
              label="Current average DSO"
              value={inputs.currentDSO}
              onChange={set('currentDSO')}
              suffix="days"
              step={1}
              min={0}
            />
            <InputField
              label="Customers paying early (within 5 days)"
              value={inputs.earlyPct}
              onChange={set('earlyPct')}
              suffix="%"
              step={1}
              min={0}
              max={100}
            />
            <InputField
              label="Customers paying on-time (within Net 15)"
              value={inputs.onTimePct}
              onChange={set('onTimePct')}
              suffix="%"
              step={1}
              min={0}
              max={100}
            />
            <InputField
              label="Customers paying late (after Net 15)"
              value={inputs.latePct}
              onChange={set('latePct')}
              suffix="%"
              step={1}
              min={0}
              max={100}
            />
            <InputField
              label="Bad debt write-off (% of revenue)"
              value={inputs.badDebtPct}
              onChange={set('badDebtPct')}
              suffix="%"
              step={0.1}
              min={0}
            />
            <InputField
              label="Annual AR insurance cost"
              value={inputs.arInsuranceCost}
              onChange={set('arInsuranceCost')}
              prefix="$"
              step={1000}
              min={0}
            />
            <InputField
              label="Annual collections / AR management cost"
              value={inputs.collectionsCost}
              onChange={set('collectionsCost')}
              prefix="$"
              step={1000}
              min={0}
            />
            <InputField
              label="Cost of capital / financing rate"
              value={inputs.costOfCapital}
              onChange={set('costOfCapital')}
              suffix="%"
              step={0.5}
              min={0}
            />
          </Section>

          <Section title="3. Current Trade Spend">
            <InputField
              label="Total annual trade spend"
              value={inputs.totalTradeSpend}
              onChange={set('totalTradeSpend')}
              prefix="$"
              step={10000}
              min={0}
              tooltip="Rebates, volume discounts, show specials, free product, GPO fees"
            />
            <InputField
              label="% of trade spend driving incremental volume"
              value={inputs.incrementalPct}
              onChange={set('incrementalPct')}
              suffix="%"
              step={1}
              min={0}
              max={100}
              tooltip="Vendor's honest estimate of what actually drives new revenue"
            />
          </Section>

          <Section title="4. Cari Assumptions" defaultOpen={true}>
            <InputField
              label="Projected DSO with Cari"
              value={inputs.projectedDSO}
              onChange={set('projectedDSO')}
              suffix="days"
              step={1}
              min={0}
            />
            <InputField
              label="Cari vendor fee rate"
              value={inputs.cariFeeRate}
              onChange={set('cariFeeRate')}
              suffix="%"
              step={0.1}
              min={0}
            />
            <InputField
              label="Projected early payment rate with Cari"
              value={inputs.cariEarlyPct}
              onChange={set('cariEarlyPct')}
              suffix="%"
              step={1}
              min={0}
              max={100}
            />
            <InputField
              label="Projected on-time payment rate with Cari"
              value={inputs.cariOnTimePct}
              onChange={set('cariOnTimePct')}
              suffix="%"
              step={1}
              min={0}
              max={100}
            />
            <InputField
              label="Projected late payment rate with Cari"
              value={inputs.cariLatePct}
              onChange={set('cariLatePct')}
              suffix="%"
              step={1}
              min={0}
              max={100}
            />
            <InputField
              label="Projected bad debt reduction"
              value={inputs.badDebtReductionPct}
              onChange={set('badDebtReductionPct')}
              suffix="%"
              step={5}
              min={0}
              max={100}
            />
            <InputField
              label="Trade spend replaced by Cari rewards"
              value={inputs.tradeSpendReplacedPct}
              onChange={set('tradeSpendReplacedPct')}
              suffix="%"
              step={5}
              min={0}
              max={100}
            />
            <InputField
              label="Projected incremental volume lift"
              value={inputs.volumeLiftPct}
              onChange={set('volumeLiftPct')}
              suffix="%"
              step={0.5}
              min={0}
            />
          </Section>
        </div>

        {/* ─── RIGHT PANEL: Results Dashboard ─────────────────────────────── */}
        <div className="flex-1 p-6 overflow-y-auto lg:h-[calc(100vh-72px)]">
          {/* Top-line KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className={`border-l-4 ${isNegative ? 'border-red-500' : 'border-green-600'} pl-4 py-2`}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Net Annual Value</p>
              <p className={`text-3xl font-bold ${isNegative ? 'text-red-600' : 'text-green-700'}`}>
                {fmtDollar(calc.netValue)}
              </p>
              {isNegative && (
                <p className="text-xs text-red-500 mt-1">Negative ROI — review assumptions</p>
              )}
            </div>
            <div className="border-l-4 border-[#2E75B6] pl-4 py-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">ROI Multiple</p>
              <p className="text-3xl font-bold text-[#1B2A4A]">{fmtMultiple(calc.roiMultiple)}</p>
              <p className="text-xs text-gray-500 mt-1">gross value / Cari cost</p>
            </div>
            <div className="border-l-4 border-[#2E75B6] pl-4 py-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Payback Period</p>
              <p className="text-3xl font-bold text-[#1B2A4A]">{fmtMonths(calc.paybackMonths)}</p>
              <p className="text-xs text-gray-500 mt-1">to recoup annual Cari cost</p>
            </div>
          </div>

          {/* Working capital highlight */}
          <div className="bg-gray-50 border border-gray-200 p-4 mb-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500 uppercase">Current AR Balance</p>
                <p className="text-lg font-semibold text-gray-800">{fmtDollar(calc.arCurrent)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Projected AR Balance</p>
                <p className="text-lg font-semibold text-[#2E75B6]">{fmtDollar(calc.arCari)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Working Capital Freed</p>
                <p className="text-lg font-semibold text-green-700">{fmtDollar(calc.wcFreed)}</p>
              </div>
            </div>
          </div>

          {/* Two-column breakdown charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* DSO Value Breakdown */}
            <div>
              <h3 className="text-sm font-semibold text-[#1B2A4A] mb-2">
                DSO Compression Value: {fmtDollar(calc.dsoTotal)}
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dsoBreakdownData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip formatter={(v) => fmtDollar(v)} />
                  <Bar dataKey="value" name="Value">
                    {dsoBreakdownData.map((_, i) => (
                      <Cell key={i} fill={['#1B2A4A', '#2E75B6', '#5b9bd5', '#8fbadd'][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="text-xs text-gray-600 mt-2 space-y-1 pl-1">
                <div className="flex justify-between"><span>Financing savings</span><span className="font-medium">{fmtDollar(calc.financingSavings)}</span></div>
                <div className="flex justify-between"><span>Bad debt savings</span><span className="font-medium">{fmtDollar(calc.badDebtSavings)}</span></div>
                <div className="flex justify-between"><span>AR insurance savings</span><span className="font-medium">{fmtDollar(calc.arInsuranceSavings)}</span></div>
                <div className="flex justify-between"><span>Collections savings</span><span className="font-medium">{fmtDollar(calc.collectionsSavings)}</span></div>
              </div>
            </div>

            {/* Trade Spend Value Breakdown */}
            <div>
              <h3 className="text-sm font-semibold text-[#1B2A4A] mb-2">
                Trade Spend Optimization: {fmtDollar(calc.tradeSpendTotal)}
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={tradeBreakdownData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip formatter={(v) => fmtDollar(v)} />
                  <Bar dataKey="value" name="Value">
                    {tradeBreakdownData.map((_, i) => (
                      <Cell key={i} fill={['#16803d', '#4ade80'][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="text-xs text-gray-600 mt-2 space-y-1 pl-1">
                <div className="flex justify-between"><span>Spend efficiency gain</span><span className="font-medium">{fmtDollar(calc.spendEfficiencyGain)}</span></div>
                <div className="flex justify-between"><span>Incremental margin (@ 25% GM)</span><span className="font-medium">{fmtDollar(calc.incrementalMargin)}</span></div>
                <div className="flex justify-between text-gray-400">
                  <span>Incremental revenue (top-line)</span>
                  <span>{fmtDollar(calc.incrementalRevenue)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Waterfall Chart */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-[#1B2A4A] mb-2">
              Cost vs. Value Waterfall
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={waterfallData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: '#6b7280' }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={65}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<WaterfallTooltip />} />
                <ReferenceLine y={0} stroke="#9ca3af" />
                <Bar dataKey="invisible" stackId="waterfall" fill="transparent" />
                <Bar dataKey="bar" stackId="waterfall" name="Value">
                  {waterfallData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.isNet
                          ? (entry.isPositive ? '#15803d' : '#dc2626')
                          : (entry.isPositive ? '#2E75B6' : '#dc2626')
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom summary */}
          <div className="border-t border-gray-200 pt-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500 uppercase">Gross Annual Value</p>
                <p className="font-semibold text-gray-800">{fmtDollar(calc.grossValue)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Annual Cari Cost</p>
                <p className="font-semibold text-red-600">{fmtDollar(calc.cariCost)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Net Value / Account</p>
                <p className={`font-semibold ${calc.perAccountValue >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {fmtDollar(calc.perAccountValue)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Cari Cost / Account</p>
                <p className="font-semibold text-gray-800">{fmtDollar(calc.perAccountCost)}</p>
              </div>
            </div>
          </div>

          {/* Assumptions footnotes */}
          <div className="border-t border-gray-100 pt-3 text-xs text-gray-400 space-y-0.5">
            <p>Assumptions: 25% gross margin applied to incremental volume. 40% collections cost reduction from automated payment incentives. AR insurance savings scale proportionally with bad debt reduction.</p>
            <p>All projections are estimates. Actual results depend on customer adoption, payment behavior changes, and market conditions.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
