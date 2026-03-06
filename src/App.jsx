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

// ─── Cashback Rate Tiers ────────────────────────────────────────────────────

const CASHBACK_TIERS = [
  { minTPV: 0,           maxTPV: 10_000_000,  rate: 0,    label: 'Under $10M' },
  { minTPV: 10_000_000,  maxTPV: 25_000_000,  rate: 0.25, label: '$10M' },
  { minTPV: 25_000_000,  maxTPV: 75_000_000,  rate: 0.50, label: '$25M' },
  { minTPV: 75_000_000,  maxTPV: 100_000_000, rate: 0.75, label: '$75M' },
  { minTPV: 100_000_000, maxTPV: Infinity,     rate: 1.00, label: '$100M+' },
];

function getCashbackTier(tpv) {
  for (let i = CASHBACK_TIERS.length - 1; i >= 0; i--) {
    if (tpv >= CASHBACK_TIERS[i].minTPV) return i;
  }
  return 0;
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
  // Basic inputs
  vendorName: '',
  annualRevenue: 15000000,
  currentDSO: 38,
  outstandingAR: 0, // derived if inputMode is 'dso'
  // Advanced: Vendor Profile
  numAccounts: 200,
  avgInvoiceSize: 2500,
  invoiceFrequency: 4,
  // Advanced: Payment Behavior
  earlyPct: 10,
  onTimePct: 45,
  latePct: 45,
  badDebtPct: 1.5,
  arInsuranceCost: 25000,
  collectionsCost: 60000,
  costOfCapital: 10,
  // Advanced: Trade Spend
  totalTradeSpend: 400000,
  incrementalPct: 20,
  // Advanced: Cari Assumptions
  ...SCENARIOS.Base,
};

// ─── Shared brand styles ──────────────────────────────────────────────────────

const BRAND = {
  stainlessSteel: 'linear-gradient(135deg, #C0C0C0 0%, #E8E8E8 25%, #A8A8A8 50%, #D4D4D4 75%, #B8B8B8 100%)',
  slate: 'linear-gradient(135deg, #2C2C2C 0%, #4A4A4A 25%, #1A1A1A 50%, #3D3D3D 75%, #2C2C2C 100%)',
  orange: '#D86830',
  orangeHover: '#C25A28',
  blue: '#86ABE0',
  iconGray: '#A9A9A9',
  font: 'Arial, sans-serif',
};

// ─── Input field component ────────────────────────────────────────────────────

function InputField({ label, value, onChange, prefix, suffix, step, min, max, tooltip, dark }) {
  const labelColor = dark ? '#FFFFFF' : '#000000';
  const inputBg = dark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.06)';
  const inputBorder = dark ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(0, 0, 0, 0.15)';
  const inputColor = dark ? '#FFFFFF' : '#000000';
  const hintColor = dark ? BRAND.iconGray : 'rgba(0,0,0,0.4)';

  return (
    <div className="mb-3">
      <label
        className="block text-sm mb-1"
        style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.01em', color: labelColor }}
      >
        {label}
        {tooltip && (
          <span className="ml-1 cursor-help" style={{ color: hintColor }} title={tooltip}>&#9432;</span>
        )}
      </label>
      <div className="flex items-center">
        {prefix && (
          <span className="text-sm mr-1" style={{ fontFamily: BRAND.font, color: hintColor }}>{prefix}</span>
        )}
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
          className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-1"
          style={{
            fontFamily: BRAND.font,
            background: inputBg,
            border: inputBorder,
            color: inputColor,
            '--tw-ring-color': BRAND.blue,
          }}
        />
        {suffix && (
          <span className="text-sm ml-1" style={{ fontFamily: BRAND.font, color: hintColor }}>{suffix}</span>
        )}
      </div>
    </div>
  );
}

// ─── Text input for vendor name ───────────────────────────────────────────────

function TextInput({ label, value, onChange, placeholder }) {
  return (
    <div className="mb-3">
      <label
        className="block text-sm mb-1"
        style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.01em', color: '#000000' }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 text-sm focus:outline-none focus:ring-1"
        style={{
          fontFamily: BRAND.font,
          background: 'rgba(0, 0, 0, 0.06)',
          border: '1px solid rgba(0, 0, 0, 0.15)',
          color: '#000000',
          '--tw-ring-color': BRAND.blue,
        }}
      />
    </div>
  );
}

// ─── Collapsible section for advanced ─────────────────────────────────────────

function AdvancedSection({ title, children, open, onToggle }) {
  return (
    <div className="mb-4" style={{ border: '1px solid rgba(255, 255, 255, 0.15)' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left cursor-pointer"
        style={{
          background: BRAND.slate,
          fontFamily: BRAND.font,
          fontWeight: '700',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          fontSize: '0.75rem',
          color: '#FFFFFF',
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: '0.65rem' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 py-3" style={{ background: 'rgba(0, 0, 0, 0.2)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Waterfall chart tooltip ──────────────────────────────────────────────────

function WaterfallTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  return (
    <div className="p-2 text-sm" style={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.2)' }}>
      <p style={{ fontFamily: BRAND.font, fontWeight: '700', color: '#FFFFFF' }}>{data.name}</p>
      <p style={{ fontFamily: BRAND.font, color: data.displayValue >= 0 ? '#4ade80' : '#f87171' }}>
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
  const [inputMode, setInputMode] = useState('dso'); // 'dso' or 'ar'
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDetailedBreakdowns, setShowDetailedBreakdowns] = useState(false);

  const set = useCallback((key) => (val) => {
    setInputs((prev) => ({ ...prev, [key]: val }));
    setActiveScenario(null);
  }, []);

  const setVendorName = useCallback((val) => {
    setInputs((prev) => ({ ...prev, vendorName: val }));
  }, []);

  const applyScenario = useCallback((name) => {
    setActiveScenario(name);
    setInputs((prev) => ({ ...prev, ...SCENARIOS[name] }));
  }, []);

  // ─── All calculations ───────────────────────────────────────────────────

  const calc = useMemo(() => {
    const {
      annualRevenue, currentDSO, outstandingAR,
      numAccounts, projectedDSO,
      costOfCapital, badDebtPct, badDebtReductionPct,
      arInsuranceCost, collectionsCost,
      totalTradeSpend, incrementalPct, tradeSpendReplacedPct,
      volumeLiftPct, cariFeeRate,
    } = inputs;

    // Derive DSO or AR depending on input mode
    const effectiveDSO = inputMode === 'ar'
      ? safeDivide(outstandingAR, safeDivide(annualRevenue, 365))
      : currentDSO;

    // A. DSO Compression Value
    const arCurrent = safeDivide(annualRevenue, 365) * effectiveDSO;
    const arCari = safeDivide(annualRevenue, 365) * projectedDSO;
    const wcFreed = arCurrent - arCari;
    const financingSavings = wcFreed * (costOfCapital / 100);
    const badDebtCurrent = annualRevenue * (badDebtPct / 100);
    const badDebtSavings = badDebtCurrent * (badDebtReductionPct / 100);
    const arInsuranceSavings = arInsuranceCost * (badDebtReductionPct / 100);
    const collectionsSavings = collectionsCost * 0.40;
    const dsoTotal = financingSavings + badDebtSavings + arInsuranceSavings + collectionsSavings;

    // B. Trade Spend Optimization Value
    const redirectedSpend = totalTradeSpend * (tradeSpendReplacedPct / 100);
    const spendEfficiencyGain = redirectedSpend * (1 - incrementalPct / 100);
    const incrementalRevenue = annualRevenue * (volumeLiftPct / 100);
    const incrementalMargin = incrementalRevenue * 0.25;
    const tradeSpendTotal = spendEfficiencyGain + incrementalMargin;

    // C. Cari Platform Cost
    const cariCost = annualRevenue * (cariFeeRate / 100);

    // D. Net Value
    const grossValue = dsoTotal + tradeSpendTotal;
    const netValue = grossValue - cariCost;
    const roiMultiple = safeDivide(grossValue, cariCost);
    const monthlyGrossValue = safeDivide(grossValue, 12);
    const paybackMonths = safeDivide(cariCost, monthlyGrossValue);

    // E. Per-Account Economics
    const perAccountValue = safeDivide(netValue, numAccounts);
    const perAccountCost = safeDivide(cariCost, numAccounts);

    // F. Cashback Tier
    const currentTierIndex = getCashbackTier(annualRevenue);
    const currentTier = CASHBACK_TIERS[currentTierIndex];
    const annualCashback = annualRevenue * (currentTier.rate / 100);
    const quarterlyCashback = annualCashback / 4;
    const nextTier = currentTierIndex < CASHBACK_TIERS.length - 1
      ? CASHBACK_TIERS[currentTierIndex + 1]
      : null;
    const tpvToNextTier = nextTier ? nextTier.minTPV - annualRevenue : 0;

    // G. Working Capital deep stats
    const dailyCashImprovement = safeDivide(wcFreed, 365);
    const dsoReduction = effectiveDSO - projectedDSO;

    return {
      effectiveDSO, arCurrent, arCari, wcFreed,
      financingSavings, badDebtCurrent, badDebtSavings,
      arInsuranceSavings, collectionsSavings, dsoTotal,
      redirectedSpend, spendEfficiencyGain,
      incrementalRevenue, incrementalMargin, tradeSpendTotal,
      cariCost, grossValue, netValue, roiMultiple, paybackMonths,
      perAccountValue, perAccountCost,
      currentTierIndex, currentTier, annualCashback, quarterlyCashback,
      nextTier, tpvToNextTier,
      dailyCashImprovement, dsoReduction,
    };
  }, [inputs, inputMode]);

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
    const vendorLabel = inputs.vendorName || 'Unnamed Vendor';
    const usingAdvanced = showAdvanced;
    const lines = [
      '════════════════════════════════════════════════════',
      `  CARI ROI ANALYSIS — ${vendorLabel.toUpperCase()}`,
      '════════════════════════════════════════════════════',
      '',
      `Scenario: ${activeScenario || 'Custom'}`,
      `Analysis Depth: ${usingAdvanced ? 'Advanced (customized)' : 'Quick (default assumptions)'}`,
      `Date: ${new Date().toLocaleDateString('en-US')}`,
      '',
      '── BASIC INPUTS ────────────────────────────────────',
      `Annual Revenue / TPV:    ${fmtDollar(inputs.annualRevenue)}`,
      `Current DSO:             ${Math.round(calc.effectiveDSO)} days`,
      `Current AR Balance:      ${fmtDollar(calc.arCurrent)}`,
      '',
      '── WORKING CAPITAL FREED ───────────────────────────',
      `Current AR Balance:      ${fmtDollar(calc.arCurrent)}`,
      `Projected AR Balance:    ${fmtDollar(calc.arCari)}`,
      `WORKING CAPITAL FREED:   ${fmtDollar(calc.wcFreed)}`,
      `Daily Cash Improvement:  ${fmtDollar(calc.dailyCashImprovement)}/day`,
      `DSO Reduction:           ${Math.round(calc.effectiveDSO)} → ${inputs.projectedDSO} days (${Math.round(calc.dsoReduction)} day improvement)`,
      '',
      '── CASHBACK RATE ───────────────────────────────────',
      `Current Tier:            ${calc.currentTier.label} (${calc.currentTier.rate}% annualized)`,
      `Annual Cashback:         ${fmtDollar(calc.annualCashback)}`,
      `Quarterly Payout:        ${fmtDollar(calc.quarterlyCashback)}`,
      calc.nextTier ? `Next Tier:               ${calc.nextTier.label} at ${calc.nextTier.rate}% (${fmtDollar(calc.tpvToNextTier)} more TPV needed)` : 'Next Tier:               Already at maximum tier',
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
      '── DSO COMPRESSION VALUE ───────────────────────────',
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
      '── ASSUMPTIONS ─────────────────────────────────────',
      '  25% gross margin on incremental volume',
      '  40% collections cost reduction from automated incentives',
      '  AR insurance savings proportional to bad debt reduction',
      '  Cashback rates are annualized, paid quarterly',
      '',
      '════════════════════════════════════════════════════',
      '  Generated by Cari ROI Calculator',
      '════════════════════════════════════════════════════',
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedFlag(true);
      setTimeout(() => setCopiedFlag(false), 2000);
    });
  }, [inputs, calc, activeScenario, showAdvanced]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const isNegative = calc.netValue < 0;

  return (
    <div className="min-h-screen" style={{ background: BRAND.stainlessSteel }}>
      {/* Header */}
      <header className="px-6 py-4" style={{ background: BRAND.slate }}>
        <div className="max-w-[1100px] mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1
              className="text-xl"
              style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.035em', color: '#FFFFFF' }}
            >
              Cari Vendor ROI Calculator
            </h1>
            <p
              className="text-sm mt-0.5"
              style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.02em', color: BRAND.iconGray }}
            >
              5-minute per-vendor analysis
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {Object.keys(SCENARIOS).map((name) => (
              <button
                key={name}
                onClick={() => applyScenario(name)}
                className="px-3 py-1.5 cursor-pointer transition-colors"
                style={{
                  fontFamily: BRAND.font,
                  fontWeight: '700',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  border: activeScenario === name ? `1px solid ${BRAND.blue}` : '1px solid rgba(255,255,255,0.3)',
                  background: activeScenario === name ? 'rgba(134,171,224,0.15)' : 'transparent',
                  color: '#FFFFFF',
                }}
              >
                {name}
              </button>
            ))}
            <button
              onClick={copySummary}
              className="ml-3 px-4 py-1.5 cursor-pointer transition-colors border-none"
              style={{
                fontFamily: BRAND.font,
                fontWeight: '700',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                fontSize: '0.75rem',
                background: BRAND.orange,
                color: '#FFFFFF',
                borderRadius: '0.25rem',
              }}
            >
              {copiedFlag ? 'Copied!' : 'Copy Summary'}
            </button>
          </div>
        </div>
      </header>

      {/* Main content — single column */}
      <div className="max-w-[1100px] mx-auto px-6 py-6">

        {/* ─── BASIC INPUTS ─────────────────────────────────────────────── */}
        <div className="mb-6 p-5 rounded" style={{ background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.7rem', color: 'rgba(0,0,0,0.5)', marginBottom: '1rem' }}>
            Vendor Quick Profile
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TextInput
              label="Vendor Name"
              value={inputs.vendorName}
              onChange={setVendorName}
              placeholder="e.g. Sysco, US Foods..."
            />
            <InputField
              label="Annual Revenue / TPV"
              value={inputs.annualRevenue}
              onChange={set('annualRevenue')}
              prefix="$"
              step={100000}
              min={0}
            />
            <div>
              {/* DSO / AR toggle */}
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={() => setInputMode('dso')}
                  className="text-xs px-2 py-0.5 cursor-pointer"
                  style={{
                    fontFamily: BRAND.font,
                    fontWeight: '700',
                    border: inputMode === 'dso' ? `1px solid ${BRAND.blue}` : '1px solid rgba(0,0,0,0.15)',
                    background: inputMode === 'dso' ? 'rgba(134,171,224,0.15)' : 'transparent',
                    color: inputMode === 'dso' ? BRAND.blue : 'rgba(0,0,0,0.5)',
                  }}
                >
                  DSO (days)
                </button>
                <button
                  onClick={() => setInputMode('ar')}
                  className="text-xs px-2 py-0.5 cursor-pointer"
                  style={{
                    fontFamily: BRAND.font,
                    fontWeight: '700',
                    border: inputMode === 'ar' ? `1px solid ${BRAND.blue}` : '1px solid rgba(0,0,0,0.15)',
                    background: inputMode === 'ar' ? 'rgba(134,171,224,0.15)' : 'transparent',
                    color: inputMode === 'ar' ? BRAND.blue : 'rgba(0,0,0,0.5)',
                  }}
                >
                  Outstanding AR ($)
                </button>
              </div>
              {inputMode === 'dso' ? (
                <InputField
                  label="Current Average DSO"
                  value={inputs.currentDSO}
                  onChange={set('currentDSO')}
                  suffix="days"
                  step={1}
                  min={0}
                />
              ) : (
                <InputField
                  label="Current Outstanding AR"
                  value={inputs.outstandingAR}
                  onChange={set('outstandingAR')}
                  prefix="$"
                  step={10000}
                  min={0}
                />
              )}
            </div>
          </div>
        </div>

        {/* ─── TOP-LINE KPIs ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="pl-4 py-3 rounded" style={{ background: 'rgba(255,255,255,0.35)', borderTop: '1px solid rgba(0,0,0,0.08)', borderRight: '1px solid rgba(0,0,0,0.08)', borderBottom: '1px solid rgba(0,0,0,0.08)', borderLeft: `4px solid ${isNegative ? '#dc2626' : '#16a34a'}` }}>
            <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem', color: '#000000' }}>
              Net Annual Value
            </p>
            <p style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.035em', fontSize: '1.875rem', color: isNegative ? '#dc2626' : '#000000' }}>
              {fmtDollar(calc.netValue)}
            </p>
            {isNegative && (
              <p style={{ fontFamily: BRAND.font, fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>Negative ROI — review assumptions</p>
            )}
          </div>
          <div className="pl-4 py-3 rounded" style={{ background: 'rgba(255,255,255,0.35)', borderTop: '1px solid rgba(0,0,0,0.08)', borderRight: '1px solid rgba(0,0,0,0.08)', borderBottom: '1px solid rgba(0,0,0,0.08)', borderLeft: `4px solid ${BRAND.blue}` }}>
            <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem', color: '#000000' }}>
              ROI Multiple
            </p>
            <p style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.035em', fontSize: '1.875rem', color: '#000000' }}>
              {fmtMultiple(calc.roiMultiple)}
            </p>
            <p style={{ fontFamily: BRAND.font, fontSize: '0.75rem', color: 'rgba(0,0,0,0.5)', marginTop: '0.25rem' }}>gross value / Cari cost</p>
          </div>
          <div className="pl-4 py-3 rounded" style={{ background: 'rgba(255,255,255,0.35)', borderTop: '1px solid rgba(0,0,0,0.08)', borderRight: '1px solid rgba(0,0,0,0.08)', borderBottom: '1px solid rgba(0,0,0,0.08)', borderLeft: `4px solid ${BRAND.blue}` }}>
            <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem', color: '#000000' }}>
              Payback Period
            </p>
            <p style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.035em', fontSize: '1.875rem', color: '#000000' }}>
              {fmtMonths(calc.paybackMonths)}
            </p>
            <p style={{ fontFamily: BRAND.font, fontSize: '0.75rem', color: 'rgba(0,0,0,0.5)', marginTop: '0.25rem' }}>to recoup annual Cari cost</p>
          </div>
        </div>

        {/* ─── WORKING CAPITAL FREED — Hero Section ─────────────────────── */}
        <div className="mb-6 p-5 rounded" style={{ background: BRAND.slate, border: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.7rem', color: BRAND.iconGray, marginBottom: '1rem' }}>
            Working Capital Opportunity
          </h2>

          {/* Hero number */}
          <div className="text-center mb-5">
            <p style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.035em', fontSize: '3rem', color: '#4ade80' }}>
              {fmtDollar(calc.wcFreed)}
            </p>
            <p style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.01em', fontSize: '0.875rem', color: BRAND.iconGray }}>
              cash freed and back in your operating account
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.6rem', color: BRAND.iconGray }}>
                Current AR
              </p>
              <p style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.02em', fontSize: '1.125rem', color: '#FFFFFF' }}>
                {fmtDollar(calc.arCurrent)}
              </p>
            </div>
            <div>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.6rem', color: BRAND.iconGray }}>
                Projected AR
              </p>
              <p style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.02em', fontSize: '1.125rem', color: BRAND.blue }}>
                {fmtDollar(calc.arCari)}
              </p>
            </div>
            <div>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.6rem', color: BRAND.iconGray }}>
                DSO Reduction
              </p>
              <p style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.02em', fontSize: '1.125rem', color: '#FFFFFF' }}>
                {Math.round(calc.effectiveDSO)} → {inputs.projectedDSO} days
              </p>
            </div>
            <div>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.6rem', color: BRAND.iconGray }}>
                Daily Cash Improvement
              </p>
              <p style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.02em', fontSize: '1.125rem', color: '#4ade80' }}>
                +{fmtDollar(calc.dailyCashImprovement)}/day
              </p>
            </div>
          </div>

          {/* What this means callout */}
          <div className="mt-4 p-3 rounded" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <p style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.01em', fontSize: '0.8rem', color: BRAND.iconGray }}>
              At your {fmtPct(inputs.costOfCapital)} cost of capital, freeing {fmtDollar(calc.wcFreed)} in working capital saves{' '}
              <span style={{ color: '#4ade80', fontWeight: '700' }}>{fmtDollar(calc.financingSavings)}/year</span>{' '}
              in financing costs alone — before counting bad debt reduction, insurance savings, and collections efficiency.
            </p>
          </div>
        </div>

        {/* ─── CASHBACK RATE COMPRESSION TABLE ──────────────────────────── */}
        <div className="mb-6 p-5 rounded" style={{ background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.7rem', color: 'rgba(0,0,0,0.5)', marginBottom: '1rem' }}>
            Cashback Rate Progression — Rewards Paid Quarterly
          </h2>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: BRAND.font }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.15)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: '700', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.5)' }}>TPV Threshold</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.75rem', fontWeight: '700', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.5)' }}>Cashback Rate</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', fontWeight: '700', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.5)' }}>Annual Cashback</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', fontWeight: '700', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.5)' }}>Quarterly Payout</th>
                </tr>
              </thead>
              <tbody>
                {CASHBACK_TIERS.map((tier, i) => {
                  const isCurrent = i === calc.currentTierIndex;
                  const rowBg = isCurrent ? 'rgba(134,171,224,0.12)' : 'transparent';
                  const rowBorder = isCurrent ? `2px solid ${BRAND.blue}` : '1px solid rgba(0,0,0,0.06)';
                  const textWeight = isCurrent ? '700' : '400';
                  const textColor = isCurrent ? '#000000' : 'rgba(0,0,0,0.6)';
                  const tierCashback = inputs.annualRevenue * (tier.rate / 100);

                  return (
                    <tr key={i} style={{ background: rowBg, borderBottom: rowBorder }}>
                      <td style={{ padding: '0.6rem 0.75rem', fontWeight: textWeight, fontSize: '0.85rem', color: textColor }}>
                        {isCurrent && <span style={{ color: BRAND.blue, marginRight: '0.5rem' }}>●</span>}
                        {tier.label}
                      </td>
                      <td style={{ textAlign: 'center', padding: '0.6rem 0.75rem', fontWeight: textWeight, fontSize: '0.85rem', color: textColor }}>
                        {tier.rate > 0 ? `${tier.rate}%` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '0.6rem 0.75rem', fontWeight: textWeight, fontSize: '0.85rem', color: textColor }}>
                        {tier.rate > 0 ? fmtDollar(tierCashback) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '0.6rem 0.75rem', fontWeight: textWeight, fontSize: '0.85rem', color: textColor }}>
                        {tier.rate > 0 ? fmtDollar(tierCashback / 4) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Next tier callout */}
          {calc.nextTier && calc.tpvToNextTier > 0 && (
            <div className="mt-3 p-3 rounded" style={{ background: 'rgba(134,171,224,0.08)', border: `1px solid rgba(134,171,224,0.2)` }}>
              <p style={{ fontFamily: BRAND.font, fontWeight: '400', fontSize: '0.8rem', color: 'rgba(0,0,0,0.7)' }}>
                <span style={{ fontWeight: '700', color: BRAND.blue }}>Next tier:</span>{' '}
                Bring {fmtDollar(calc.tpvToNextTier)} more in TPV to unlock {calc.nextTier.rate}% cashback ({calc.nextTier.label} tier)
              </p>
            </div>
          )}
          {!calc.nextTier && calc.currentTier.rate > 0 && (
            <div className="mt-3 p-3 rounded" style={{ background: 'rgba(22,163,106,0.08)', border: '1px solid rgba(22,163,106,0.2)' }}>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', fontSize: '0.8rem', color: '#16a34a' }}>
                Maximum tier reached — earning {calc.currentTier.rate}% cashback
              </p>
            </div>
          )}
        </div>

        {/* ─── WATERFALL CHART ──────────────────────────────────────────── */}
        <div className="mb-6 p-4 rounded" style={{ background: 'rgba(255,255,255,0.3)', border: '1px solid rgba(0,0,0,0.08)' }}>
          <h3 style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.7rem', color: '#000000', marginBottom: '0.75rem' }}>
            Cost vs. Value Waterfall
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={waterfallData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fill: '#000000', fontFamily: BRAND.font }}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={65}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.5)', fontFamily: BRAND.font }}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<WaterfallTooltip />} />
              <ReferenceLine y={0} stroke="rgba(0,0,0,0.2)" />
              <Bar dataKey="invisible" stackId="waterfall" fill="transparent" />
              <Bar dataKey="bar" stackId="waterfall" name="Value" radius={[2, 2, 0, 0]}>
                {waterfallData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.isNet
                        ? (entry.isPositive ? '#16a34a' : '#dc2626')
                        : (entry.isPositive ? '#86ABE0' : '#dc2626')
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ─── BOTTOM SUMMARY ───────────────────────────────────────────── */}
        <div className="pt-4 mb-6" style={{ borderTop: '1px solid rgba(0,0,0,0.15)' }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem', color: 'rgba(0,0,0,0.5)' }}>
                Gross Annual Value
              </p>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', fontSize: '0.875rem', color: '#000000' }}>
                {fmtDollar(calc.grossValue)}
              </p>
            </div>
            <div>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem', color: 'rgba(0,0,0,0.5)' }}>
                Annual Cari Cost
              </p>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', fontSize: '0.875rem', color: '#dc2626' }}>
                {fmtDollar(calc.cariCost)}
              </p>
            </div>
            <div>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem', color: 'rgba(0,0,0,0.5)' }}>
                Net Value / Account
              </p>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', fontSize: '0.875rem', color: calc.perAccountValue >= 0 ? '#16a34a' : '#dc2626' }}>
                {fmtDollar(calc.perAccountValue)}
              </p>
            </div>
            <div>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem', color: 'rgba(0,0,0,0.5)' }}>
                Cari Cost / Account
              </p>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', fontSize: '0.875rem', color: '#000000' }}>
                {fmtDollar(calc.perAccountCost)}
              </p>
            </div>
          </div>
        </div>

        {/* ─── ADVANCED INPUTS (collapsible) ────────────────────────────── */}
        <AdvancedSection
          title="Advanced Inputs — Fine-Tune Your Analysis"
          open={showAdvanced}
          onToggle={() => setShowAdvanced(!showAdvanced)}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Column 1: Vendor Profile */}
            <div>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem', color: BRAND.iconGray, marginBottom: '0.75rem' }}>
                Vendor Profile
              </p>
              <InputField dark label="Number of active restaurant accounts" value={inputs.numAccounts} onChange={set('numAccounts')} step={1} min={1} />
              <InputField dark label="Average invoice size" value={inputs.avgInvoiceSize} onChange={set('avgInvoiceSize')} prefix="$" step={100} min={0} />
              <InputField dark label="Invoice frequency / customer / month" value={inputs.invoiceFrequency} onChange={set('invoiceFrequency')} step={1} min={1} />

              <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem', color: BRAND.iconGray, marginBottom: '0.75rem', marginTop: '1rem' }}>
                Trade Spend
              </p>
              <InputField dark label="Total annual trade spend" value={inputs.totalTradeSpend} onChange={set('totalTradeSpend')} prefix="$" step={10000} min={0} tooltip="Rebates, volume discounts, show specials, free product, GPO fees" />
              <InputField dark label="% driving incremental volume" value={inputs.incrementalPct} onChange={set('incrementalPct')} suffix="%" step={1} min={0} max={100} />
            </div>

            {/* Column 2: AR & Payment Behavior */}
            <div>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem', color: BRAND.iconGray, marginBottom: '0.75rem' }}>
                Current Payment Behavior
              </p>
              <InputField dark label="Customers paying early (within 5 days)" value={inputs.earlyPct} onChange={set('earlyPct')} suffix="%" step={1} min={0} max={100} />
              <InputField dark label="Customers paying on-time (Net 15)" value={inputs.onTimePct} onChange={set('onTimePct')} suffix="%" step={1} min={0} max={100} />
              <InputField dark label="Customers paying late (after Net 15)" value={inputs.latePct} onChange={set('latePct')} suffix="%" step={1} min={0} max={100} />
              <InputField dark label="Bad debt write-off (% of revenue)" value={inputs.badDebtPct} onChange={set('badDebtPct')} suffix="%" step={0.1} min={0} />
              <InputField dark label="Annual AR insurance cost" value={inputs.arInsuranceCost} onChange={set('arInsuranceCost')} prefix="$" step={1000} min={0} />
              <InputField dark label="Annual collections cost" value={inputs.collectionsCost} onChange={set('collectionsCost')} prefix="$" step={1000} min={0} />
              <InputField dark label="Cost of capital / financing rate" value={inputs.costOfCapital} onChange={set('costOfCapital')} suffix="%" step={0.5} min={0} />
            </div>

            {/* Column 3: Cari Assumptions */}
            <div>
              <p style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem', color: BRAND.iconGray, marginBottom: '0.75rem' }}>
                Cari Assumptions
              </p>
              <InputField dark label="Projected DSO with Cari" value={inputs.projectedDSO} onChange={set('projectedDSO')} suffix="days" step={1} min={0} />
              <InputField dark label="Cari vendor fee rate" value={inputs.cariFeeRate} onChange={set('cariFeeRate')} suffix="%" step={0.1} min={0} />
              <InputField dark label="Projected early payment %" value={inputs.cariEarlyPct} onChange={set('cariEarlyPct')} suffix="%" step={1} min={0} max={100} />
              <InputField dark label="Projected on-time payment %" value={inputs.cariOnTimePct} onChange={set('cariOnTimePct')} suffix="%" step={1} min={0} max={100} />
              <InputField dark label="Projected late payment %" value={inputs.cariLatePct} onChange={set('cariLatePct')} suffix="%" step={1} min={0} max={100} />
              <InputField dark label="Projected bad debt reduction" value={inputs.badDebtReductionPct} onChange={set('badDebtReductionPct')} suffix="%" step={5} min={0} max={100} />
              <InputField dark label="Trade spend replaced by Cari" value={inputs.tradeSpendReplacedPct} onChange={set('tradeSpendReplacedPct')} suffix="%" step={5} min={0} max={100} />
              <InputField dark label="Projected volume lift" value={inputs.volumeLiftPct} onChange={set('volumeLiftPct')} suffix="%" step={0.5} min={0} />
            </div>
          </div>
        </AdvancedSection>

        {/* ─── DETAILED BREAKDOWNS (collapsible) ────────────────────────── */}
        <AdvancedSection
          title="Detailed Value Breakdowns"
          open={showDetailedBreakdowns}
          onToggle={() => setShowDetailedBreakdowns(!showDetailedBreakdowns)}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* DSO Value Breakdown */}
            <div className="p-4 rounded" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.7rem', color: '#FFFFFF', marginBottom: '0.75rem' }}>
                DSO Compression Value: {fmtDollar(calc.dsoTotal)}
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dsoBreakdownData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#FFFFFF', fontFamily: BRAND.font }} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)', fontFamily: BRAND.font }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => fmtDollar(v)} />
                  <Bar dataKey="value" name="Value" radius={[2, 2, 0, 0]}>
                    {dsoBreakdownData.map((_, i) => (
                      <Cell key={i} fill={['#86ABE0', '#6B96D4', '#A8C4EB', '#5A82BF'][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1 pl-1" style={{ fontSize: '0.75rem' }}>
                <div className="flex justify-between" style={{ fontFamily: BRAND.font, color: 'rgba(255,255,255,0.5)' }}>
                  <span>Financing savings</span><span style={{ fontWeight: '700', color: '#FFFFFF' }}>{fmtDollar(calc.financingSavings)}</span>
                </div>
                <div className="flex justify-between" style={{ fontFamily: BRAND.font, color: 'rgba(255,255,255,0.5)' }}>
                  <span>Bad debt savings</span><span style={{ fontWeight: '700', color: '#FFFFFF' }}>{fmtDollar(calc.badDebtSavings)}</span>
                </div>
                <div className="flex justify-between" style={{ fontFamily: BRAND.font, color: 'rgba(255,255,255,0.5)' }}>
                  <span>AR insurance savings</span><span style={{ fontWeight: '700', color: '#FFFFFF' }}>{fmtDollar(calc.arInsuranceSavings)}</span>
                </div>
                <div className="flex justify-between" style={{ fontFamily: BRAND.font, color: 'rgba(255,255,255,0.5)' }}>
                  <span>Collections savings</span><span style={{ fontWeight: '700', color: '#FFFFFF' }}>{fmtDollar(calc.collectionsSavings)}</span>
                </div>
              </div>
            </div>

            {/* Trade Spend Value Breakdown */}
            <div className="p-4 rounded" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ fontFamily: BRAND.font, fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.7rem', color: '#FFFFFF', marginBottom: '0.75rem' }}>
                Trade Spend Optimization: {fmtDollar(calc.tradeSpendTotal)}
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={tradeBreakdownData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#FFFFFF', fontFamily: BRAND.font }} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)', fontFamily: BRAND.font }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => fmtDollar(v)} />
                  <Bar dataKey="value" name="Value" radius={[2, 2, 0, 0]}>
                    {tradeBreakdownData.map((_, i) => (
                      <Cell key={i} fill={['#86ABE0', '#6B96D4'][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1 pl-1" style={{ fontSize: '0.75rem' }}>
                <div className="flex justify-between" style={{ fontFamily: BRAND.font, color: 'rgba(255,255,255,0.5)' }}>
                  <span>Spend efficiency gain</span><span style={{ fontWeight: '700', color: '#FFFFFF' }}>{fmtDollar(calc.spendEfficiencyGain)}</span>
                </div>
                <div className="flex justify-between" style={{ fontFamily: BRAND.font, color: 'rgba(255,255,255,0.5)' }}>
                  <span>Incremental margin (@ 25% GM)</span><span style={{ fontWeight: '700', color: '#FFFFFF' }}>{fmtDollar(calc.incrementalMargin)}</span>
                </div>
              </div>
            </div>
          </div>
        </AdvancedSection>

        {/* ─── Assumptions footnotes ────────────────────────────────────── */}
        <div className="pt-3 space-y-0.5" style={{ borderTop: '1px solid rgba(0,0,0,0.1)' }}>
          <p style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.01em', fontSize: '0.75rem', color: 'rgba(0,0,0,0.4)' }}>
            Assumptions: 25% gross margin on incremental volume. 40% collections cost reduction from automated payment incentives. AR insurance savings proportional to bad debt reduction. Cashback rates are annualized and paid quarterly.
          </p>
          <p style={{ fontFamily: BRAND.font, fontWeight: '400', letterSpacing: '-0.01em', fontSize: '0.75rem', color: 'rgba(0,0,0,0.4)' }}>
            {showAdvanced
              ? 'Using customized advanced inputs for detailed analysis.'
              : 'Using default assumptions for quick analysis. Open "Advanced Inputs" above to fine-tune.'}
          </p>
        </div>
      </div>
    </div>
  );
}
