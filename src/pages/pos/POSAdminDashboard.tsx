import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  CreditCard,
  Clock,
  Download,
  Calendar,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Award,
  Sparkles,
  ArrowUpRight,
  PieChart,
  Layers,
  BarChart2,
  Wrench,
  Percent,
  Users,
  ShieldCheck,
  Building2,
  AlertCircle,
  Monitor,
  Printer,
  FileSpreadsheet
} from 'lucide-react';
import {
  loadPOSStore,
  fetchRemotePOSStore,
  subscribePOSRealtime,
  toISODate,
  getMondayOfWeek,
  calculateOrderMargin,
  calculateDebtAgingMatrix,
  calculateWeeklyBalance,
  exportFullFinancialReportToCSV,
  getRoleCapabilities
} from '../../lib/posStore';
import { POSLiveTerminalCards } from './components/POSLiveTerminalCards';
import { POSBlindCashCountModal } from './components/POSBlindCashCountModal';
import { POSDebtAgingWidget } from './components/POSDebtAgingWidget';
import { POSFinancialCharts } from './components/POSFinancialCharts';

export function POSAdminDashboard() {
  const [store, setStore] = useState(loadPOSStore);
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview', 'terminals', 'aging', 'orders'
  const [timeframe, setTimeframe] = useState('week'); // 'today', 'week', 'prev_week', 'month', 'year', 'custom'
  const [selectedAdvisorId, setSelectedAdvisorId] = useState('all');
  const [customFrom, setCustomFrom] = useState(toISODate(new Date(Date.now() - 30 * 86400000)));
  const [customTo, setCustomTo] = useState(toISODate());

  // Blind Cash Audit Modal State
  const [auditingAdvisor, setAuditingAdvisor] = useState(null);

  // Realtime subscription
  useEffect(() => {
    fetchRemotePOSStore().then((remote) => {
      if (remote) setStore(remote);
    });
    const unsubscribe = subscribePOSRealtime((remote) => {
      if (remote) setStore(remote);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const money = (val) => `$${(Number(val) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Determine date bounds based on timeframe
  const dateRange = useMemo(() => {
    const today = new Date();
    const todayStr = toISODate(today);

    if (timeframe === 'today') {
      return { from: todayStr, to: todayStr, label: 'Hoy' };
    }
    if (timeframe === 'week') {
      const mon = getMondayOfWeek(today);
      const sat = new Date(new Date(mon).getTime() + 5 * 86400000);
      return { from: mon, to: toISODate(sat), label: 'Esta Semana' };
    }
    if (timeframe === 'prev_week') {
      const monThis = new Date(getMondayOfWeek(today));
      const monPrev = new Date(monThis.getTime() - 7 * 86400000);
      const satPrev = new Date(monPrev.getTime() + 5 * 86400000);
      return { from: toISODate(monPrev), to: toISODate(satPrev), label: 'Semana Anterior' };
    }
    if (timeframe === 'month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: toISODate(first), to: toISODate(last), label: 'Este Mes' };
    }
    if (timeframe === 'year') {
      const first = new Date(today.getFullYear(), 0, 1);
      const last = new Date(today.getFullYear(), 11, 31);
      return { from: toISODate(first), to: toISODate(last), label: 'Año en Curso' };
    }
    return { from: customFrom, to: customTo, label: 'Rango Personalizado' };
  }, [timeframe, customFrom, customTo]);

  // Filter orders by date range and advisor
  const filteredOrders = useMemo(() => {
    return (store.orders || []).filter((order) => {
      const inDate = (!dateRange.from || order.orderDate >= dateRange.from) && (!dateRange.to || order.orderDate <= dateRange.to);
      const inAdvisor = selectedAdvisorId === 'all' || order.advisorId === selectedAdvisorId;
      return inDate && inAdvisor && order.status !== 'cancelled';
    });
  }, [store.orders, dateRange, selectedAdvisorId]);

  // Filter payments by date range and advisor
  const filteredPayments = useMemo(() => {
    return (store.payments || []).filter((p) => {
      const inDate = (!dateRange.from || p.paymentDate >= dateRange.from) && (!dateRange.to || p.paymentDate <= dateRange.to);
      const inAdvisor = selectedAdvisorId === 'all' || p.advisorId === selectedAdvisorId;
      return inDate && inAdvisor;
    });
  }, [store.payments, dateRange, selectedAdvisorId]);

  // Filter expenses by date range and advisor
  const filteredExpenses = useMemo(() => {
    return (store.expenses || []).filter((e) => {
      const inDate = (!dateRange.from || e.expenseDate >= dateRange.from) && (!dateRange.to || e.expenseDate <= dateRange.to);
      const inAdvisor = selectedAdvisorId === 'all' || e.advisorId === selectedAdvisorId;
      return inDate && inAdvisor;
    });
  }, [store.expenses, dateRange, selectedAdvisorId]);

  // Financial KPIs Calculations
  const metrics = useMemo(() => {
    const grossSales = filteredOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const totalDeposited = filteredOrders.reduce((sum, o) => sum + (Number(o.depositAmount) || 0), 0);
    const balanceDue = filteredOrders.reduce((sum, o) => sum + (Number(o.balanceDue) || 0), 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const paymentMethods = {
      cash: filteredPayments.filter((p) => p.paymentMethod === 'cash').reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
      transfer: filteredPayments.filter((p) => p.paymentMethod === 'transfer').reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
      card: filteredPayments.filter((p) => p.paymentMethod === 'card').reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
      check: filteredPayments.filter((p) => p.paymentMethod === 'check').reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    };

    const netCashInRegister = Math.max(0, paymentMethods.cash - totalExpenses);
    const collectionRate = grossSales > 0 ? (totalDeposited / grossSales) * 100 : 0;

    // Real Estimated Gross Margin (Job Costing)
    let totalDirectCost = 0;
    filteredOrders.forEach((o) => {
      const items = (store.orderItems || []).filter((it) => it.orderId === o.id);
      const margin = calculateOrderMargin(o, items, store.materials || []);
      totalDirectCost += margin.estimatedCost;
    });

    const grossProfit = Math.max(0, grossSales - totalDirectCost - totalExpenses);
    const grossMarginPercent = grossSales > 0 ? (grossProfit / grossSales) * 100 : 0;
    const totalTaxCollected = filteredOrders.reduce((sum, o) => sum + (Number(o.taxAmount) || 0), 0);

    return {
      dateRangeLabel: dateRange.label,
      grossSales,
      totalDeposited,
      balanceDue,
      totalExpenses,
      paymentMethods,
      netCashInRegister,
      collectionRate,
      orderCount: filteredOrders.length,
      averageTicket: filteredOrders.length > 0 ? grossSales / filteredOrders.length : 0,
      totalDirectCost,
      grossProfit,
      marginPercent: Number(grossMarginPercent.toFixed(1)),
      totalTaxCollected
    };
  }, [filteredOrders, filteredPayments, filteredExpenses, store.orderItems, store.materials, dateRange]);

  // Weekly Balance Matrix for Trend Chart
  const weeklyBalance = useMemo(() => {
    return calculateWeeklyBalance(store, getMondayOfWeek(), selectedAdvisorId);
  }, [store, selectedAdvisorId]);

  // Aging Matrix for active debt
  const agingData = useMemo(() => {
    return calculateDebtAgingMatrix(store.orders || []);
  }, [store.orders]);

  // Top Performing Substrates
  const substrateBreakdown = useMemo(() => {
    const map = {};
    filteredOrders.forEach((o) => {
      const items = (store.orderItems || []).filter((it) => it.orderId === o.id);
      items.forEach((it) => {
        const cat = it.category || 'Otros';
        if (!map[cat]) map[cat] = { revenue: 0, count: 0, areaM2: 0 };
        map[cat].revenue += Number(it.totalPrice || 0);
        map[cat].count += Number(it.quantity || 1);
        map[cat].areaM2 += Number(it.areaM2 || 0);
      });
    });

    return Object.entries(map).map(([category, stats]) => ({
      category,
      ...stats,
      percent: metrics.grossSales > 0 ? (stats.revenue / metrics.grossSales) * 100 : 0
    })).sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders, store.orderItems, metrics.grossSales]);

  // Advisor Leaderboard
  const advisorStats = useMemo(() => {
    return (store.advisors || []).filter((adv) => getRoleCapabilities(adv.role).hasSalesGoal).map((adv) => {
      const advOrders = (store.orders || []).filter(
        (o) => o.advisorId === adv.id && (!dateRange.from || o.orderDate >= dateRange.from) && (!dateRange.to || o.orderDate <= dateRange.to) && o.status !== 'cancelled'
      );
      const sales = advOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
      const deposits = advOrders.reduce((sum, o) => sum + (Number(o.depositAmount) || 0), 0);
      const goal = Number(adv.weeklyGoal || 0);
      const progress = goal > 0 ? (sales / goal) * 100 : 0;

      return {
        ...adv,
        ordersCount: advOrders.length,
        sales,
        deposits,
        goal,
        progress
      };
    }).sort((a, b) => b.sales - a.sales);
  }, [store.advisors, store.orders, dateRange]);

  const handleExportCSV = () => {
    exportFullFinancialReportToCSV(metrics, filteredOrders, store.advisors || [], agingData);
  };

  const handlePrintReport = () => {
    window.print();
  };

  const handleOpenAuditModal = (terminalInfo) => {
    const adv = (store.advisors || []).find((a) => a.id === terminalInfo.advisorId);
    if (adv) {
      setAuditingAdvisor({ advisor: adv, shift: terminalInfo.shift });
    }
  };

  return (
    <div style={{ display: 'grid', gap: '20px', padding: '10px 0' }}>
      
      {/* ----------------------------------------------------------------------
          TOP HEADER & TIMEFRAME CONTROLS
          ---------------------------------------------------------------------- */}
      <div className="pos-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'var(--orange)', color: '#fff', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={22} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: 'var(--ink)' }}>
                Finanzas & Monitoreo de Puntos de Venta
              </h1>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Período activo: <b>{dateRange.label}</b> ({dateRange.from} al {dateRange.to})
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Timeframe Pills */}
          <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: '10px', padding: '3px', border: '1px solid var(--line)' }}>
            {[
              { id: 'today', label: 'Hoy' },
              { id: 'week', label: 'Esta Semana' },
              { id: 'prev_week', label: 'Sem. Anterior' },
              { id: 'month', label: 'Este Mes' },
              { id: 'year', label: 'Año' }
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTimeframe(t.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: timeframe === t.id ? 'var(--orange)' : 'transparent',
                  color: timeframe === t.id ? '#fff' : 'var(--ink)',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <button
            type="button"
            onClick={handleExportCSV}
            style={{
              background: '#047857',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FileSpreadsheet size={15} /> Exportar Excel
          </button>

          <button
            type="button"
            onClick={handlePrintReport}
            style={{
              background: '#f1f5f9',
              color: 'var(--ink)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Printer size={15} /> Imprimir
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------------
          EXECUTIVE KPI MATRICES (6 CARDS)
          ---------------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        
        {/* KPI 1: Facturación */}
        <div className="pos-card" style={{ padding: '14px', display: 'grid', gap: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Facturación Bruta</span>
          <strong style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', fontFamily: 'Space Grotesk' }}>
            {money(metrics.grossSales)}
          </strong>
          <small style={{ fontSize: '11px', color: 'var(--orange-dark)', fontWeight: 700 }}>
            {metrics.orderCount} trabajos en el período
          </small>
        </div>

        {/* KPI 2: Recaudación Líquida */}
        <div className="pos-card" style={{ padding: '14px', display: 'grid', gap: '4px', borderLeft: '4px solid #16a34a' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase' }}>Recaudación Real</span>
          <strong style={{ fontSize: '22px', fontWeight: 900, color: '#15803d', fontFamily: 'Space Grotesk' }}>
            {money(metrics.totalDeposited)}
          </strong>
          <small style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>
            Cobranza efectiva: {metrics.collectionRate.toFixed(1)}%
          </small>
        </div>

        {/* KPI 3: Cartera por Cobrar */}
        <div className="pos-card" style={{ padding: '14px', display: 'grid', gap: '4px', borderLeft: '4px solid #dc2626' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase' }}>Cartera por Cobrar</span>
          <strong style={{ fontSize: '22px', fontWeight: 900, color: '#b91c1c', fontFamily: 'Space Grotesk' }}>
            {money(metrics.balanceDue)}
          </strong>
          <small style={{ fontSize: '11px', color: '#dc2626', fontWeight: 700 }}>
            Saldos pendientes en taller
          </small>
        </div>

        {/* KPI 4: Margen Bruto Estimado */}
        <div className="pos-card" style={{ padding: '14px', display: 'grid', gap: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Margen Bruto Est.</span>
          <strong style={{ fontSize: '22px', fontWeight: 900, color: '#0284c7', fontFamily: 'Space Grotesk' }}>
            {money(metrics.grossProfit)}
          </strong>
          <small style={{ fontSize: '11px', color: '#0369a1', fontWeight: 700 }}>
            Rentabilidad: {metrics.marginPercent}%
          </small>
        </div>

        {/* KPI 5: Gastos Menores */}
        <div className="pos-card" style={{ padding: '14px', display: 'grid', gap: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Gastos de Caja Menor</span>
          <strong style={{ fontSize: '22px', fontWeight: 900, color: '#c2410c', fontFamily: 'Space Grotesk' }}>
            {money(metrics.totalExpenses)}
          </strong>
          <small style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700 }}>
            Egresos operativos autorizados
          </small>
        </div>

        {/* KPI 6: Ticket Promedio */}
        <div className="pos-card" style={{ padding: '14px', display: 'grid', gap: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Ticket Promedio</span>
          <strong style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', fontFamily: 'Space Grotesk' }}>
            {money(metrics.averageTicket)}
          </strong>
          <small style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700 }}>
            IVA 15% rec.: {money(metrics.totalTaxCollected)}
          </small>
        </div>

      </div>

      {/* ----------------------------------------------------------------------
          DASHBOARD SUB-NAVIGATION TABS
          ---------------------------------------------------------------------- */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid var(--line)', paddingBottom: '4px' }}>
        {[
          { id: 'overview', label: '📊 Resumen & Gráficos', badge: null },
          { id: 'terminals', label: '🖥️ Monitoreo Multi-Terminal en Vivo', badge: 'EN TIEMPO REAL' },
          { id: 'aging', label: '⚠️ Cartera & Aging (0-60d)', badge: agingData.count > 0 ? `${agingData.count} deudores` : null },
          { id: 'orders', label: '📑 Libro de Órdenes & Detalle', badge: filteredOrders.length }
        ].map((tab) => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '3px solid var(--orange)' : '3px solid transparent',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 900,
                color: isActive ? 'var(--orange)' : 'var(--muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '-6px'
              }}
            >
              <span>{tab.label}</span>
              {tab.badge && (
                <span style={{
                  background: isActive ? 'var(--orange)' : '#e2e8f0',
                  color: isActive ? '#fff' : 'var(--muted)',
                  fontSize: '10px',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '10px'
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ----------------------------------------------------------------------
          TAB CONTENT 1: OVERVIEW & CHARTS
          ---------------------------------------------------------------------- */}
      {activeSubTab === 'overview' && (
        <div style={{ display: 'grid', gap: '20px' }}>
          
          {/* Visual SVG Financial Charts */}
          <POSFinancialCharts
            dailyBreakdown={weeklyBalance.days || []}
            paymentMethods={metrics.paymentMethods || {}}
          />

          {/* Bottom Split: Advisor Leaderboard + Substrate Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
            
            {/* Advisor Leaderboard */}
            <div className="pos-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Award size={18} style={{ color: 'var(--orange)' }} />
                  Rendimiento por Asesora Comercial
                </h4>
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800 }}>Metas individuales</span>
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                {advisorStats.map((adv, idx) => (
                  <div key={adv.id} style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '12px', border: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: idx === 0 ? '#f59e0b' : '#94a3b8', color: '#fff', fontSize: '11px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {idx + 1}
                        </span>
                        <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>{adv.name}</strong>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ fontSize: '14px', fontFamily: 'Space Grotesk', color: 'var(--ink)' }}>
                          {money(adv.sales)}
                        </strong>
                        <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px' }}>
                          ({adv.ordersCount} trab.)
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, adv.progress)}%`, height: '100%', background: adv.progress >= 100 ? '#16a34a' : 'var(--orange)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Substrate & Line of Product Breakdown */}
            <div className="pos-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={18} style={{ color: '#0284c7' }} />
                  Volumen por Categoría de Sustrato
                </h4>
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800 }}>Participación (%)</span>
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                {substrateBreakdown.map((s, idx) => (
                  <div key={idx} style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '12px', border: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>{s.category}</strong>
                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ fontSize: '14px', fontFamily: 'Space Grotesk', color: 'var(--ink)' }}>
                          {money(s.revenue)}
                        </strong>
                        <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px' }}>
                          ({s.percent.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    {s.areaM2 > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                        Área producida: <b>{s.areaM2.toFixed(2)} m²</b> ({s.count} ítems)
                      </div>
                    )}
                    <div style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${s.percent}%`, height: '100%', background: '#0284c7' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ----------------------------------------------------------------------
          TAB CONTENT 2: LIVE MULTI-TERMINAL MONITORING
          ---------------------------------------------------------------------- */}
      {activeSubTab === 'terminals' && (
        <POSLiveTerminalCards
          store={store}
          onSelectAdvisorForAudit={handleOpenAuditModal}
        />
      )}

      {/* ----------------------------------------------------------------------
          TAB CONTENT 3: DEBT AGING MATRIX (CUENTAS POR COBRAR)
          ---------------------------------------------------------------------- */}
      {activeSubTab === 'aging' && (
        <POSDebtAgingWidget orders={store.orders || []} />
      )}

      {/* ----------------------------------------------------------------------
          TAB CONTENT 4: DETAILED ORDERS LEDGER
          ---------------------------------------------------------------------- */}
      {activeSubTab === 'orders' && (
        <div className="pos-card" style={{ display: 'grid', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>
              Libro Detallado de Órdenes ({filteredOrders.length} registros)
            </h4>
            <div style={{ display: 'flex', gap: '10px' }}>
              <select
                className="pos-select"
                value={selectedAdvisorId}
                onChange={(e) => setSelectedAdvisorId(e.target.value)}
                style={{ width: '180px', fontSize: '12px' }}
              >
                <option value="all">Todas las Asesoras</option>
                {(store.advisors || []).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="pos-orders-table" style={{ width: '100%', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Fecha</th>
                  <th>Asesora</th>
                  <th>Cliente</th>
                  <th>Trabajo</th>
                  <th>Etapa</th>
                  <th>Total</th>
                  <th>Abonado</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.slice(0, 30).map((o) => {
                  const adv = (store.advisors || []).find((a) => a.id === o.advisorId);
                  return (
                    <tr key={o.id}>
                      <td>
                        <strong style={{ color: 'var(--orange-dark)' }}>#{o.orderNumber}</strong>
                      </td>
                      <td>{o.orderDate}</td>
                      <td>{adv ? adv.name : (o.advisorId || 'Ventas')}</td>
                      <td>
                        <div style={{ fontWeight: 800 }}>{o.customerName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{o.customerIdentification}</div>
                      </td>
                      <td>{o.jobName}</td>
                      <td>
                        <span style={{ textTransform: 'capitalize', fontSize: '11px', background: '#f1f5f9', padding: '3px 6px', borderRadius: '6px', fontWeight: 800 }}>
                          {o.productionStage}
                        </span>
                      </td>
                      <td><strong>{money(o.totalAmount)}</strong></td>
                      <td><span style={{ color: '#16a34a', fontWeight: 800 }}>{money(o.depositAmount)}</span></td>
                      <td>
                        <strong style={{ color: Number(o.balanceDue) > 0 ? '#dc2626' : 'var(--muted)', fontFamily: 'Space Grotesk' }}>
                          {money(o.balanceDue)}
                        </strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------
          BLIND CASH COUNT AUDIT MODAL
          ---------------------------------------------------------------------- */}
      {auditingAdvisor && (
        <POSBlindCashCountModal
          store={store}
          advisor={auditingAdvisor.advisor}
          shift={auditingAdvisor.shift}
          onClose={() => setAuditingAdvisor(null)}
          onAuditSaved={(updatedStore) => {
            setStore(updatedStore);
          }}
        />
      )}

    </div>
  );
}
