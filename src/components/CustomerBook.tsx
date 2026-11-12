import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Award,
  BadgeDollarSign,
  Building2,
  Calendar,
  Clock3,
  FileText,
  Filter,
  MessageCircle,
  Percent,
  PhoneCall,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UserRoundPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace, formatDate, formatMoney } from '../app/workspace';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import { Avatar } from './ui/Avatar';
import { ChatterDrawer360 } from './ui/ChatterDrawer360';
import { VisualCorpVault } from './VisualCorpVault';
import './customer-book.css';

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  avatarUrl?: string;
  documentReference?: string;
  notes: string;
  createdAt: string;
  preferences?: Record<string, any>;
  tags?: string[];
  source?: string;
  customerType?: string;
  company?: string;
  contactPerson?: string;
  city?: string;
  preferredChannel?: string;
  interests?: string;
};

type CustomerProfileDraft = {
  name: string;
  phone: string;
  email: string;
  documentReference: string;
  customerType: string;
  company: string;
  contactPerson: string;
  city: string;
  source: string;
  preferredChannel: string;
  interests: string;
  tags: string;
  notes: string;
};

const CUSTOMER_TYPE_OPTIONS = [
  { value: 'person', label: 'Persona' },
  { value: 'business', label: 'Negocio o emprendimiento' },
  { value: 'organization', label: 'Empresa o institución' },
  { value: 'reseller', label: 'Agencia o revendedor' },
  { value: 'other', label: 'Otro' },
] as const;

function customerTypeLabel(value: unknown): string {
  const type = String(value || '').trim();
  return CUSTOMER_TYPE_OPTIONS.find((option) => option.value === type)?.label || type;
}

function customerTypeValue(customer: Customer): string {
  return String(customer.preferences?.customerType || customer.customerType || '').trim();
}

function createCustomerProfileDraft(customer?: Customer): CustomerProfileDraft {
  const preferences = customer?.preferences || {};
  const value = (
    key: 'customerType' | 'company' | 'contactPerson' | 'city' | 'source' | 'preferredChannel' | 'interests',
  ) => String(preferences[key] || customer?.[key] || '');
  return {
    name: String(customer?.name || ''),
    phone: String(customer?.phone || ''),
    email: String(customer?.email || ''),
    documentReference: String(customer?.documentReference || ''),
    customerType: value('customerType'),
    company: value('company'),
    contactPerson: value('contactPerson'),
    city: value('city'),
    source: value('source'),
    preferredChannel: value('preferredChannel'),
    interests: value('interests'),
    tags: Array.isArray(customer?.tags) ? customer.tags.join(', ') : String(customer?.tags || ''),
    notes: String(customer?.notes || ''),
  };
}

function parseCustomerTags(value: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .forEach((tag) => {
      const key = tag.toLocaleLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      tags.push(tag);
    });
  return tags;
}

function normalizeCustomerSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}

function customerMatchesSearch(customer: Customer, term: string): boolean {
  const normalizedTerm = normalizeCustomerSearch(term);
  if (!normalizedTerm) return true;
  const compactTerm = normalizedTerm.replace(/[^a-z0-9]/g, '');
  const preferenceValues = Object.values(customer.preferences || {}).filter(
    (value) => typeof value === 'string' || typeof value === 'number',
  );
  const searchableValues = [
    customer.name,
    customer.phone,
    customer.email,
    customer.documentReference,
    customer.notes,
    customer.source,
    customer.customerType,
    customer.company,
    customer.contactPerson,
    customer.city,
    customer.interests,
    customer.preferredChannel,
    ...(customer.tags || []),
    ...preferenceValues,
  ];
  return searchableValues.some((value) => {
    const normalizedValue = normalizeCustomerSearch(value);
    return (
      normalizedValue.includes(normalizedTerm) ||
      Boolean(compactTerm && normalizedValue.replace(/[^a-z0-9]/g, '').includes(compactTerm))
    );
  });
}

function customerPreferencesFromDraft(draft: CustomerProfileDraft, existing?: Record<string, any>) {
  return {
    ...(existing || {}),
    customerType: draft.customerType.trim(),
    company: draft.company.trim(),
    contactPerson: draft.contactPerson.trim(),
    city: draft.city.trim(),
    source: draft.source.trim(),
    preferredChannel: draft.preferredChannel,
    interests: draft.interests.trim(),
  };
}

type InteractionType = 'note' | 'call' | 'message' | 'meeting' | 'follow_up';

const INTERACTION_TYPE_META: Record<InteractionType, { label: string; badgeClass: string }> = {
  note: { label: 'Nota interna', badgeClass: 'is-note' },
  call: { label: 'Llamada telefónica', badgeClass: 'is-call' },
  message: { label: 'WhatsApp / Mensaje', badgeClass: 'is-message' },
  meeting: { label: 'Reunión / Visita', badgeClass: 'is-meeting' },
  follow_up: { label: 'Seguimiento comercial', badgeClass: 'is-followup' },
};

function buildWhatsAppHref(rawPhone: string | undefined, customerName: string): string | null {
  const digits = String(rawPhone || '').replace(/\D+/g, '');
  if (digits.length < 8) return null;
  const normalized = digits.startsWith('593')
    ? digits
    : digits.startsWith('0')
      ? `593${digits.slice(1)}`
      : digits.length === 9
        ? `593${digits}`
        : digits;
  const text = encodeURIComponent(`Hola ${customerName || ''}, te saludamos de Visual Corp.`);
  return `https://wa.me/${normalized}?text=${text}`;
}

export function CustomerBook() {
  const { data, add, update, flash } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCustomerId = searchParams.get('cliente') || '';
  const { organizationId, user, hasPermission } = useAuth();
  const canEdit = hasPermission('crm', 'edit');
  const canViewSales = hasPermission('sales', 'view');
  const canViewQuotes = hasPermission('quotes', 'view');

  const [term, setTerm] = useState('');
  const [contactFilter, setContactFilter] = useState<
    'all' | 'vip' | 'with_balance' | 'with_quotes' | 'corporate' | 'inactive' | 'phone' | 'email'
  >('all');
  const [customerTypeFilter, setCustomerTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'recent' | 'ltv' | 'purchases' | 'balance' | 'name'>('recent');
  const [showAddForm, setShowAddForm] = useState(false);
  const [remoteCustomers, setRemoteCustomers] = useState<Customer[] | null>(null);
  const [orgSales, setOrgSales] = useState<any[]>([]);
  const [orgQuotes, setOrgQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [selectedId, setSelectedId] = useState(requestedCustomerId);
  const [sales, setSales] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [posSummary, setPosSummary] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [interactionSummary, setInteractionSummary] = useState('');
  const [interactionType, setInteractionType] = useState<InteractionType>('follow_up');
  const [interactionFilter, setInteractionFilter] = useState<'all' | InteractionType>('all');
  const [profileSaving, setProfileSaving] = useState(false);
  const [showChatter360, setShowChatter360] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    documentReference: '',
    customerType: '',
    source: '',
    notes: '',
    interests: '',
    tags: '',
    company: '',
    contactPerson: '',
    city: '',
    preferredChannel: '',
  });
  const [profileForm, setProfileForm] = useState<CustomerProfileDraft>(() => createCustomerProfileDraft());

  const selectCustomer = (id: string) => {
    setSelectedId(id);
    setSearchParams(id ? { cliente: id } : {}, { replace: true });
  };

  React.useEffect(() => {
    setSelectedId(requestedCustomerId);
  }, [requestedCustomerId]);

  React.useEffect(() => {
    if (!supabase || !organizationId) {
      setLoading(false);
      return;
    }
    let active = true;
    Promise.all([
      supabase
        .from('customers')
        .select('id,full_name,phone,email,document_reference,notes,created_at,preferences,tags')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false }),
      supabase.rpc('list_visualcorp_customer_google_avatars'),
      canViewSales
        ? supabase
            .from('sales')
            .select('id,customer_id,subtotal,discount_total,total,paid_total,balance_due,status,created_at')
            .eq('organization_id', organizationId)
            .eq('status', 'confirmed')
            .order('created_at', { ascending: false })
            .limit(600)
        : Promise.resolve({ data: [], error: null }),
      canViewQuotes
        ? supabase
            .from('central_quotes')
            .select('id,customer_id,selected_total,status,created_at')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
    ]).then(([{ data: rows, error }, avatarResult, orgSalesResult, orgQuotesResult]) => {
      if (!active) return;
      if (error) flash(`No se pudo cargar la base de clientes: ${error.message}`);
      else {
        const avatarRows = (avatarResult.data || []) as Array<{ customer_id: string; avatar_url: string | null }>;
        const avatars = new Map<string, string>(avatarRows.map((row): [string, string] => [row.customer_id, row.avatar_url || '']));
        setRemoteCustomers(
          (rows || []).map((row) => ({
            id: row.id,
            name: row.full_name,
            phone: row.phone,
            email: row.email,
            avatarUrl: avatars.get(row.id) || '',
            documentReference: row.document_reference,
            notes: row.notes,
            createdAt: row.created_at,
            preferences: row.preferences || {},
            tags: row.tags || [],
          })),
        );
        setOrgSales(orgSalesResult.data || []);
        setOrgQuotes(orgQuotesResult.data || []);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [organizationId, canViewSales, canViewQuotes]);

  const customers = remoteCustomers || data.customers || [];
  const selectedCustomer = customers.find((customer) => customer.id === selectedId);

  React.useEffect(() => {
    setProfileForm(createCustomerProfileDraft(selectedCustomer));
  }, [selectedCustomer?.id]);

  // Per-customer metrics map computed from orgSales and orgQuotes
  const customerMetricsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        salesCount: number;
        totalSpent: number;
        totalDiscounts: number;
        balanceDue: number;
        lastPurchaseAt: string | null;
        quotesCount: number;
        convertedQuotesCount: number;
      }
    >();

    for (const s of orgSales) {
      if (!s.customer_id) continue;
      const prev = map.get(s.customer_id) || {
        salesCount: 0,
        totalSpent: 0,
        totalDiscounts: 0,
        balanceDue: 0,
        lastPurchaseAt: null,
        quotesCount: 0,
        convertedQuotesCount: 0,
      };
      prev.salesCount += 1;
      prev.totalSpent += Number(s.total) || 0;
      prev.totalDiscounts += Number(s.discount_total) || 0;
      prev.balanceDue += Math.max(0, Number(s.balance_due) || 0);
      if (!prev.lastPurchaseAt || new Date(s.created_at) > new Date(prev.lastPurchaseAt)) {
        prev.lastPurchaseAt = s.created_at;
      }
      map.set(s.customer_id, prev);
    }

    for (const q of orgQuotes) {
      if (!q.customer_id) continue;
      const prev = map.get(q.customer_id) || {
        salesCount: 0,
        totalSpent: 0,
        totalDiscounts: 0,
        balanceDue: 0,
        lastPurchaseAt: null,
        quotesCount: 0,
        convertedQuotesCount: 0,
      };
      prev.quotesCount += 1;
      if (q.status === 'approved' || q.status === 'converted' || q.status === 'won') {
        prev.convertedQuotesCount += 1;
      }
      map.set(q.customer_id, prev);
    }

    return map;
  }, [orgSales, orgQuotes]);

  // Global CRM Executive KPIs
  const globalCrmKpis = useMemo(() => {
    const customersWithPhone = customers.filter((customer) => customer.phone?.trim()).length;
    const customersWithEmail = customers.filter((customer) => customer.email?.trim()).length;
    const corporateCount = customers.filter(
      (c) => Boolean(c.preferences?.company?.trim()) || String(c.documentReference || '').trim().length === 13,
    ).length;

    let activeBuyers = 0;
    let vipBuyers = 0;
    let withBalanceCount = 0;
    let withQuotesCount = 0;
    let inactive60dCount = 0;
    let totalLtv = 0;
    let totalReceivable = 0;
    let totalDiscounts = 0;
    let totalPurchaseOrders = 0;
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;

    for (const c of customers) {
      const m = customerMetricsMap.get(c.id);
      if (m) {
        if (m.salesCount > 0) {
          activeBuyers += 1;
          totalPurchaseOrders += m.salesCount;
          totalLtv += m.totalSpent;
          totalDiscounts += m.totalDiscounts;
          if (m.salesCount >= 2 || m.totalSpent >= 150) vipBuyers += 1;
        }
        if (m.balanceDue > 0.009) {
          withBalanceCount += 1;
          totalReceivable += m.balanceDue;
        }
        if (m.quotesCount > 0) withQuotesCount += 1;
        if (!m.lastPurchaseAt || new Date(m.lastPurchaseAt).getTime() < sixtyDaysAgo) {
          inactive60dCount += 1;
        }
      } else {
        inactive60dCount += 1;
      }
    }

    const avgTicket = totalPurchaseOrders > 0 ? totalLtv / totalPurchaseOrders : 0;
    const totalQuotesCount = orgQuotes.length;
    const convertedQuotesTotal = orgQuotes.filter(
      (q) => q.status === 'approved' || q.status === 'converted' || q.status === 'won',
    ).length;
    const quoteConversionPct = totalQuotesCount > 0 ? Math.round((convertedQuotesTotal / totalQuotesCount) * 100) : 0;

    return {
      customersWithPhone,
      customersWithEmail,
      corporateCount,
      activeBuyers,
      vipBuyers,
      withBalanceCount,
      withQuotesCount,
      inactive60dCount,
      totalLtv,
      totalReceivable,
      totalDiscounts,
      avgTicket,
      totalQuotesCount,
      quoteConversionPct,
    };
  }, [customers, customerMetricsMap, orgQuotes]);

  React.useEffect(() => {
    if (!selectedId || !supabase || !organizationId) {
      setSales([]);
      setQuotes([]);
      setInteractions([]);
      setPosSummary(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    Promise.all([
      canViewSales
        ? supabase
            .from('sales')
            .select('id,sale_number,status,subtotal,discount_total,discount_reason,total,paid_total,balance_due,created_at,note,sale_lines(description_snapshot,quantity,line_total)')
            .eq('organization_id', organizationId)
            .eq('customer_id', selectedId)
            .eq('status', 'confirmed')
            .order('created_at', { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      canViewQuotes
        ? supabase
            .from('central_quotes')
            .select('id,quote_code,selected_total,status,created_at,items')
            .eq('organization_id', organizationId)
            .eq('customer_id', selectedId)
            .order('created_at', { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('customer_interactions')
        .select('id,interaction_type,summary,occurred_at,created_at')
        .eq('organization_id', organizationId)
        .eq('customer_id', selectedId)
        .order('occurred_at', { ascending: false })
        .limit(100),
      canViewSales
        ? supabase.rpc('get_visualcorp_pos_customer_summary', { p_customer_id: selectedId })
        : Promise.resolve({ data: null, error: null }),
    ])
      .then(([salesResult, quoteResult, interactionResult, summaryResult]) => {
        if (!active) return;
        const resultWithError = [salesResult, quoteResult, interactionResult].find((result) => result.error);
        if (resultWithError?.error) flash(`No se pudo completar el historial: ${resultWithError.error.message}`);
        setSales(salesResult.data || []);
        setQuotes(quoteResult.data || []);
        setInteractions(interactionResult.data || []);
        setPosSummary(summaryResult?.data || null);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId, organizationId, canViewSales, canViewQuotes]);

  const visible = useMemo(() => {
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    return customers
      .filter((customer) => customerMatchesSearch(customer, term))
      .filter((customer) => customerTypeFilter === 'all' || customerTypeValue(customer) === customerTypeFilter)
      .filter((customer) => {
        if (contactFilter === 'all') return true;
        if (contactFilter === 'phone') return Boolean(customer.phone?.trim());
        if (contactFilter === 'email') return Boolean(customer.email?.trim());
        const m = customerMetricsMap.get(customer.id);
        if (contactFilter === 'vip') return Boolean(m && (m.salesCount >= 2 || m.totalSpent >= 150));
        if (contactFilter === 'with_balance') return Boolean(m && m.balanceDue > 0.009);
        if (contactFilter === 'with_quotes') return Boolean(m && m.quotesCount > 0);
        if (contactFilter === 'corporate')
          return Boolean(customer.preferences?.company?.trim() || String(customer.documentReference || '').trim().length === 13);
        if (contactFilter === 'inactive')
          return !m?.lastPurchaseAt || new Date(m.lastPurchaseAt).getTime() < sixtyDaysAgo;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
        const ma = customerMetricsMap.get(a.id);
        const mb = customerMetricsMap.get(b.id);
        if (sortBy === 'ltv') return (mb?.totalSpent || 0) - (ma?.totalSpent || 0);
        if (sortBy === 'purchases') return (mb?.salesCount || 0) - (ma?.salesCount || 0);
        if (sortBy === 'balance') return (mb?.balanceDue || 0) - (ma?.balanceDue || 0);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [customers, term, contactFilter, customerTypeFilter, sortBy, customerMetricsMap]);

  // Detailed metrics for selectedCustomer
  const selectedCustomerStats = useMemo(() => {
    const lifetimeValue = sales.reduce((total, sale) => total + Number(sale.total || 0), 0);
    const totalDiscounts = sales.reduce((total, sale) => total + Number(sale.discount_total || 0), 0);
    const discountedSalesCount = sales.filter((s) => Number(s.discount_total) > 0).length;
    const balanceDue = sales.reduce((total, sale) => total + Math.max(0, Number(sale.balance_due || 0)), 0);
    const avgTicket = sales.length > 0 ? lifetimeValue / sales.length : 0;
    const convertedQuotes = quotes.filter(
      (q) => q.status === 'approved' || q.status === 'converted' || q.status === 'won',
    ).length;
    const quoteConvPct = quotes.length > 0 ? Math.round((convertedQuotes / quotes.length) * 100) : 0;

    // Top products from RPC or aggregated from sale_lines
    const rpcTopProducts = Array.isArray(posSummary?.top_products) ? posSummary.top_products : [];
    let topProducts = rpcTopProducts;
    if (!topProducts.length && sales.length > 0) {
      const byDesc = new Map<string, { description: string; quantity: number; net_amount: number }>();
      for (const s of sales) {
        for (const line of s.sale_lines || []) {
          const key = String(line.description_snapshot || 'Producto').trim();
          const prev = byDesc.get(key) || { description: key, quantity: 0, net_amount: 0 };
          prev.quantity += Number(line.quantity) || 0;
          prev.net_amount += Number(line.line_total) || 0;
          byDesc.set(key, prev);
        }
      }
      topProducts = [...byDesc.values()].sort((a, b) => b.net_amount - a.net_amount).slice(0, 5);
    }

    return {
      lifetimeValue: posSummary?.net_spent != null ? Number(posSummary.net_spent) : lifetimeValue,
      netPaid: posSummary?.net_paid != null ? Number(posSummary.net_paid) : Math.max(0, lifetimeValue - balanceDue),
      balanceDue: posSummary?.balance_due != null ? Number(posSummary.balance_due) : balanceDue,
      avgTicket: posSummary?.average_ticket != null ? Number(posSummary.average_ticket) : avgTicket,
      totalDiscounts,
      discountedSalesCount,
      convertedQuotes,
      quoteConvPct,
      topProducts,
    };
  }, [sales, quotes, posSummary]);

  const filteredInteractions = useMemo(() => {
    if (interactionFilter === 'all') return interactions;
    return interactions.filter((entry) => entry.interaction_type === interactionFilter);
  }, [interactions, interactionFilter]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !form.name.trim()) return;
    const duplicate = customers.find(
      (c) => c.name.trim().toLowerCase() === form.name.trim().toLowerCase() && (c.phone || '') === form.phone.trim(),
    );
    if (duplicate) {
      flash('Ese cliente ya está registrado.');
      return;
    }
    const profileDraft: CustomerProfileDraft = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      documentReference: form.documentReference.trim(),
      customerType: form.customerType,
      source: form.source.trim(),
      company: form.company.trim(),
      contactPerson: form.contactPerson.trim(),
      city: form.city.trim(),
      preferredChannel: form.preferredChannel,
      interests: form.interests.trim(),
      tags: form.tags,
      notes: form.notes.trim(),
    };
    const values = { ...profileDraft, tags: parseCustomerTags(profileDraft.tags) };
    const preferences = customerPreferencesFromDraft(profileDraft);
    const useSharedDatabase = Boolean(supabase && organizationId && user);
    if (supabase && organizationId && user) {
      const { data: saved, error } = await supabase
        .from('customers')
        .insert({
          organization_id: organizationId,
          full_name: values.name,
          phone: values.phone,
          email: values.email,
          document_reference: values.documentReference,
          notes: values.notes,
          preferences,
          tags: values.tags,
          created_by: user.id,
        })
        .select('id,full_name,phone,email,document_reference,notes,created_at,preferences,tags')
        .single();
      if (error) {
        flash(`No se guardó el cliente: ${error.message}`);
        return;
      }
      const customer = {
        id: saved.id,
        name: saved.full_name,
        phone: saved.phone,
        email: saved.email,
        documentReference: saved.document_reference,
        notes: saved.notes,
        createdAt: saved.created_at,
        preferences: saved.preferences || {},
        tags: saved.tags || [],
      };
      setRemoteCustomers((current) => [customer, ...(current || [])]);
      selectCustomer(customer.id);
    } else {
      const customer = add('customers', { ...values, preferences });
      selectCustomer(customer.id);
    }
    setForm({
      name: '',
      phone: '',
      email: '',
      documentReference: '',
      customerType: '',
      source: '',
      notes: '',
      interests: '',
      tags: '',
      company: '',
      contactPerson: '',
      city: '',
      preferredChannel: '',
    });
    setShowAddForm(false);
    flash(useSharedDatabase ? 'Cliente guardado en la base compartida.' : 'Cliente guardado localmente.');
  };

  const saveCustomerProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !selectedCustomer || !profileForm.name.trim()) return;
    const values: CustomerProfileDraft = {
      ...profileForm,
      name: profileForm.name.trim(),
      phone: profileForm.phone.trim(),
      email: profileForm.email.trim(),
      documentReference: profileForm.documentReference.trim(),
      source: profileForm.source.trim(),
      company: profileForm.company.trim(),
      contactPerson: profileForm.contactPerson.trim(),
      city: profileForm.city.trim(),
      interests: profileForm.interests.trim(),
      tags: profileForm.tags,
      notes: profileForm.notes.trim(),
    };
    const tags = parseCustomerTags(values.tags);
    const preferences = customerPreferencesFromDraft(values, selectedCustomer.preferences);
    const localPatch = {
      name: values.name,
      phone: values.phone,
      email: values.email,
      documentReference: values.documentReference,
      notes: values.notes,
      preferences,
      tags,
      customerType: values.customerType,
      company: values.company,
      contactPerson: values.contactPerson,
      city: values.city,
      source: values.source,
      preferredChannel: values.preferredChannel,
      interests: values.interests,
    };
    setProfileSaving(true);
    try {
      if (supabase && organizationId) {
        const { data: saved, error } = await supabase
          .from('customers')
          .update({
            full_name: values.name,
            phone: values.phone,
            email: values.email,
            document_reference: values.documentReference,
            notes: values.notes,
            preferences,
            tags,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId)
          .eq('id', selectedCustomer.id)
          .select('id,full_name,phone,email,document_reference,notes,created_at,preferences,tags')
          .maybeSingle();
        if (error) {
          flash(`No se guardó la ficha: ${error.message}`);
          return;
        }
        if (!saved) {
          flash('No se encontró el cliente para actualizar.');
          return;
        }
        const updatedCustomer: Customer = {
          id: saved.id,
          name: saved.full_name,
          phone: saved.phone,
          email: saved.email,
          documentReference: saved.document_reference,
          notes: saved.notes,
          createdAt: saved.created_at,
          preferences: saved.preferences || {},
          tags: saved.tags || [],
        };
        setRemoteCustomers((current) =>
          current
            ? current.map((customer) => (customer.id === updatedCustomer.id ? updatedCustomer : customer))
            : current,
        );
        update('customers', selectedCustomer.id, localPatch);
        flash('Ficha del cliente actualizada en la base compartida.');
      } else {
        update('customers', selectedCustomer.id, localPatch);
        flash('Ficha del cliente actualizada localmente.');
      }
      setProfileForm({ ...values, tags: tags.join(', ') });
    } catch (error) {
      flash(`No se guardó la ficha: ${error instanceof Error ? error.message : 'Error inesperado.'}`);
    } finally {
      setProfileSaving(false);
    }
  };

  const addInteraction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !selectedCustomer || !interactionSummary.trim() || !supabase || !organizationId || !user) return;
    const { data: created, error } = await supabase
      .from('customer_interactions')
      .insert({
        organization_id: organizationId,
        customer_id: selectedCustomer.id,
        interaction_type: interactionType,
        summary: interactionSummary.trim(),
        created_by: user.id,
      })
      .select('id,interaction_type,summary,occurred_at,created_at')
      .single();
    if (error) flash(`No se registró la interacción: ${error.message}`);
    else {
      setInteractions((current) => [created, ...current]);
      setInteractionSummary('');
      flash(`${INTERACTION_TYPE_META[interactionType].label} agregada al historial del cliente.`);
    }
  };

  const whatsappHref = selectedCustomer ? buildWhatsAppHref(selectedCustomer.phone, selectedCustomer.name) : null;

  return (
    <div className="customer-book">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CRM · CLIENTES, SEGMENTACIÓN Y MÉTRICAS 360°</div>
          <h1>{selectedCustomer ? selectedCustomer.name : 'CRM y Directorio de Clientes'}</h1>
          <p>
            {selectedCustomer
              ? 'Ficha 360°, valor de vida (LTV), descuentos aplicados, saldos pendientes, cotizaciones y bitácora de seguimiento.'
              : 'Analiza el comportamiento comercial de tu cartera, segmenta clientes VIP o con saldo por cobrar y gestiona su relación.'}
          </p>
        </div>
        <div className="customer-heading-actions">
          <Link className="button button-outline" to="/operaciones/crm">
            <Sparkles size={15} /> Embudo de Solicitudes
          </Link>
          {!selectedCustomer && canEdit && (
            <button type="button" className="button button-dark" onClick={() => setShowAddForm((open) => !open)}>
              {showAddForm ? <X size={15} /> : <Plus size={16} />} {showAddForm ? 'Cerrar' : 'Agregar cliente'}
            </button>
          )}
        </div>
      </div>

      {selectedCustomer ? (
        <>
          <div className="customer-detail-topbar">
            <button type="button" className="button button-outline customer-back" onClick={() => selectCustomer('')}>
              <ArrowLeft size={15} /> Volver al directorio
            </button>
            <div className="customer-quick-actions">
              <button
                type="button"
                className="button button-outline"
                onClick={() => setShowChatter360(true)}
              >
                <Sparkles size={15} /> Ficha 360° &amp; Chatter
              </button>
              {whatsappHref && (
                <a className="button button-outline is-whatsapp" href={whatsappHref} target="_blank" rel="noreferrer">
                  <MessageCircle size={15} /> WhatsApp directo
                </a>
              )}
              <Link className="button button-outline" to="/operaciones/cotizador">
                <FileText size={15} /> Nueva cotización
              </Link>
              <Link className="button button-dark" to="/operaciones/pos">
                <ShoppingBag size={15} /> Vender en POS
              </Link>
            </div>
          </div>

          <div className="customer-summary-grid customer-summary-grid-6">
            <article className="panel customer-summary-card">
              <small>Compras confirmadas</small>
              <b>{canViewSales ? sales.length : 'Sin permiso'}</b>
              <span className="customer-summary-sub">
                {sales[0] ? `Última: ${formatDate(sales[0].created_at)}` : 'Sin compras'}
              </span>
            </article>
            <article className="panel customer-summary-card">
              <small>Facturación Neta (LTV)</small>
              <b>{canViewSales ? formatMoney(selectedCustomerStats.lifetimeValue) : 'Sin permiso'}</b>
              <span className="customer-summary-sub">Pagado: {formatMoney(selectedCustomerStats.netPaid)}</span>
            </article>
            <article className="panel customer-summary-card">
              <small>Ticket Promedio</small>
              <b>{canViewSales ? formatMoney(selectedCustomerStats.avgTicket) : 'Sin permiso'}</b>
              <span className="customer-summary-sub">Valor medio por pedido</span>
            </article>
            <article className={`panel customer-summary-card ${selectedCustomerStats.balanceDue > 0 ? 'is-alert' : ''}`}>
              <small>Saldo por Cobrar</small>
              <b>{canViewSales ? formatMoney(selectedCustomerStats.balanceDue) : 'Sin permiso'}</b>
              <span className="customer-summary-sub">
                {selectedCustomerStats.balanceDue > 0 ? 'Cartera pendiente de cobro' : 'Al día ($0,00)'}
              </span>
            </article>
            <article className="panel customer-summary-card">
              <small>Descuentos Comerciales</small>
              <b>{canViewSales ? formatMoney(selectedCustomerStats.totalDiscounts) : 'Sin permiso'}</b>
              <span className="customer-summary-sub">
                En {selectedCustomerStats.discountedSalesCount} compra{selectedCustomerStats.discountedSalesCount === 1 ? '' : 's'}
              </span>
            </article>
            <article className="panel customer-summary-card">
              <small>Cotizaciones y Conversión</small>
              <b>{canViewQuotes ? `${quotes.length} (${selectedCustomerStats.quoteConvPct}%)` : 'Sin permiso'}</b>
              <span className="customer-summary-sub">{selectedCustomerStats.convertedQuotes} aprobadas / convertidas</span>
            </article>
          </div>

          {selectedCustomerStats.topProducts.length > 0 && (
            <section className="panel customer-top-products-bar" aria-label="Productos más comprados por este cliente">
              <div className="customer-top-products-head">
                <Award size={15} />
                <b>Productos frecuentes de {selectedCustomer.name}:</b>
              </div>
              <div className="customer-top-products-chips">
                {selectedCustomerStats.topProducts.map((prod: any, idx: number) => (
                  <span key={`${prod.description}_${idx}`} className="customer-top-product-chip">
                    <b>{prod.description}</b>
                    <small>
                      {Number(prod.quantity || 0)} u. · {formatMoney(Number(prod.net_amount || 0))}
                    </small>
                  </span>
                ))}
              </div>
            </section>
          )}

          <div className="customer-detail-grid">
            <section className="panel customer-detail-card">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">FICHA DEL CLIENTE</span>
                  <h2>Datos, clasificación y preferencias</h2>
                </div>
              </div>
              <form className="customer-profile-form" onSubmit={saveCustomerProfile}>
                <fieldset className="customer-profile-section">
                  <legend>Datos principales</legend>
                  <div className="customer-profile-fields">
                    <label>
                      Nombre o razón social *
                      <input
                        required
                        maxLength={160}
                        autoComplete="name"
                        value={profileForm.name}
                        disabled={!canEdit}
                        onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })}
                      />
                    </label>
                    <label>
                      Teléfono
                      <input
                        autoComplete="tel"
                        maxLength={50}
                        value={profileForm.phone}
                        disabled={!canEdit}
                        onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })}
                      />
                    </label>
                    <label>
                      Correo electrónico
                      <input
                        type="email"
                        autoComplete="email"
                        maxLength={254}
                        value={profileForm.email}
                        disabled={!canEdit}
                        onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })}
                      />
                    </label>
                    <label>
                      Cédula o RUC
                      <input
                        maxLength={40}
                        autoComplete="off"
                        placeholder="Documento de identificación"
                        value={profileForm.documentReference}
                        disabled={!canEdit}
                        onChange={(event) => setProfileForm({ ...profileForm, documentReference: event.target.value })}
                      />
                    </label>
                  </div>
                </fieldset>
                <fieldset className="customer-profile-section">
                  <legend>Información comercial (opcional)</legend>
                  <p className="customer-profile-help">
                    Completa lo que ayude a atender y dar seguimiento a este cliente. Puedes dejarlo vacío.
                  </p>
                  <div className="customer-profile-fields">
                    <label>
                      Tipo de cliente
                      <select
                        value={profileForm.customerType}
                        disabled={!canEdit}
                        onChange={(event) => setProfileForm({ ...profileForm, customerType: event.target.value })}
                      >
                        <option value="">Sin clasificar</option>
                        {CUSTOMER_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                        {profileForm.customerType &&
                          !CUSTOMER_TYPE_OPTIONS.some((option) => option.value === profileForm.customerType) && (
                            <option value={profileForm.customerType}>{customerTypeLabel(profileForm.customerType)}</option>
                          )}
                      </select>
                    </label>
                    <label>
                      Empresa o institución
                      <input
                        maxLength={160}
                        placeholder="Nombre de la organización"
                        value={profileForm.company}
                        disabled={!canEdit}
                        onChange={(event) => setProfileForm({ ...profileForm, company: event.target.value })}
                      />
                    </label>
                    <label>
                      Persona de contacto
                      <input
                        maxLength={160}
                        placeholder="Nombre de quien coordina"
                        value={profileForm.contactPerson}
                        disabled={!canEdit}
                        onChange={(event) => setProfileForm({ ...profileForm, contactPerson: event.target.value })}
                      />
                    </label>
                    <label>
                      Ciudad
                      <input
                        maxLength={120}
                        placeholder="Ciudad"
                        value={profileForm.city}
                        disabled={!canEdit}
                        onChange={(event) => setProfileForm({ ...profileForm, city: event.target.value })}
                      />
                    </label>
                    <label>
                      Origen o referencia
                      <input
                        maxLength={160}
                        placeholder="Referido, redes sociales, web…"
                        value={profileForm.source}
                        disabled={!canEdit}
                        onChange={(event) => setProfileForm({ ...profileForm, source: event.target.value })}
                      />
                    </label>
                    <label>
                      Canal preferido
                      <select
                        value={profileForm.preferredChannel}
                        disabled={!canEdit}
                        onChange={(event) => setProfileForm({ ...profileForm, preferredChannel: event.target.value })}
                      >
                        <option value="">Sin especificar</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="phone">Llamada</option>
                        <option value="email">Correo</option>
                        {profileForm.preferredChannel &&
                          !['whatsapp', 'phone', 'email'].includes(profileForm.preferredChannel) && (
                            <option value={profileForm.preferredChannel}>{profileForm.preferredChannel}</option>
                          )}
                      </select>
                    </label>
                  </div>
                  <label>
                    Intereses y preferencias
                    <textarea
                      rows={3}
                      maxLength={1000}
                      placeholder="Productos, acabados, colores o necesidades que el cliente comentó"
                      value={profileForm.interests}
                      disabled={!canEdit}
                      onChange={(event) => setProfileForm({ ...profileForm, interests: event.target.value })}
                    />
                  </label>
                  <label>
                    Etiquetas separadas por comas
                    <input
                      maxLength={1200}
                      placeholder="cliente frecuente, empresas, eventos"
                      value={profileForm.tags}
                      disabled={!canEdit}
                      onChange={(event) => setProfileForm({ ...profileForm, tags: event.target.value })}
                    />
                  </label>
                  <label>
                    Notas internas
                    <textarea
                      rows={3}
                      maxLength={4000}
                      placeholder="Acuerdos, recomendaciones de atención u otra información pertinente"
                      value={profileForm.notes}
                      disabled={!canEdit}
                      onChange={(event) => setProfileForm({ ...profileForm, notes: event.target.value })}
                    />
                  </label>
                </fieldset>
                {canEdit && (
                  <button className="button button-dark" type="submit" disabled={profileSaving}>
                    {profileSaving ? 'Guardando…' : 'Guardar ficha'}
                  </button>
                )}
              </form>

              {canEdit && (
                <form className="customer-interaction-form" onSubmit={addInteraction}>
                  <div className="customer-interaction-type-row">
                    <span>Tipo de actividad CRM:</span>
                    <div className="customer-interaction-type-pills">
                      {(Object.keys(INTERACTION_TYPE_META) as InteractionType[]).map((tKey) => (
                        <button
                          key={tKey}
                          type="button"
                          className={`customer-type-pill ${interactionType === tKey ? 'active' : ''}`}
                          onClick={() => setInteractionType(tKey)}
                        >
                          {INTERACTION_TYPE_META[tKey].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label>
                    Registrar actividad o nota en la bitácora del cliente
                    <textarea
                      required
                      maxLength={2000}
                      rows={2}
                      value={interactionSummary}
                      onChange={(event) => setInteractionSummary(event.target.value)}
                      placeholder="¿Qué se conversó, cotizó o qué acuerdo de seguimiento quedó pendiente?"
                    />
                  </label>
                  <button className="button button-outline" type="submit">
                    Guardar en bitácora CRM
                  </button>
                </form>
              )}

              <div className="customer-timeline">
                <div className="customer-timeline-head">
                  <h3>
                    <Clock3 size={15} /> Seguimiento ({filteredInteractions.length})
                  </h3>
                  <select
                    aria-label="Filtrar bitácora por tipo"
                    value={interactionFilter}
                    onChange={(e) => setInteractionFilter(e.target.value as 'all' | InteractionType)}
                  >
                    <option value="all">Todos los tipos</option>
                    {(Object.keys(INTERACTION_TYPE_META) as InteractionType[]).map((tKey) => (
                      <option key={tKey} value={tKey}>
                        {INTERACTION_TYPE_META[tKey].label}
                      </option>
                    ))}
                  </select>
                </div>
                {filteredInteractions.length ? (
                  filteredInteractions.map((entry) => {
                    const meta = INTERACTION_TYPE_META[entry.interaction_type as InteractionType] || INTERACTION_TYPE_META.note;
                    return (
                      <article key={entry.id}>
                        <div className="customer-timeline-meta">
                          <span className={`customer-interaction-badge ${meta.badgeClass}`}>{meta.label}</span>
                          <time>{formatDate(entry.occurred_at)}</time>
                        </div>
                        <p>{entry.summary}</p>
                      </article>
                    );
                  })
                ) : (
                  <p className="inventory-empty">Todavía no hay notas de seguimiento con este filtro.</p>
                )}
              </div>
            </section>

            <div className="customer-history-column">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">HISTORIAL COMERCIAL</span>
                    <h2>Compras confirmadas y descuentos</h2>
                  </div>
                  <span className="muted-count">{sales.length} compras</span>
                </div>
                {detailLoading ? (
                  <div className="inventory-empty">Cargando historial…</div>
                ) : !canViewSales ? (
                  <div className="inventory-empty">Tu perfil no permite consultar el historial de ventas.</div>
                ) : sales.length ? (
                  <div className="customer-history-list">
                    {sales.map((sale) => (
                      <article key={sale.id}>
                        <span>
                          <b>
                            {sale.sale_number ? `${sale.sale_number} · ` : ''}
                            {formatDate(sale.created_at)}
                          </b>
                          <small>
                            {(sale.sale_lines || []).map((line: any) => `${line.description_snapshot} × ${line.quantity}`).join(' · ') ||
                              sale.note ||
                              'Venta registrada'}
                          </small>
                          {(Number(sale.discount_total) > 0 || Number(sale.balance_due) > 0) && (
                            <span className="customer-sale-subchips">
                              {Number(sale.discount_total) > 0 && (
                                <em className="is-discount">
                                  Desc.: -{formatMoney(sale.discount_total)}
                                  {sale.discount_reason ? ` (${sale.discount_reason})` : ''}
                                </em>
                              )}
                              {Number(sale.balance_due) > 0 && (
                                <em className="is-balance">Por cobrar: {formatMoney(sale.balance_due)}</em>
                              )}
                            </span>
                          )}
                        </span>
                        <strong>{formatMoney(sale.total)}</strong>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="inventory-empty">Este cliente aún no tiene ventas confirmadas asociadas.</div>
                )}
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">PROPUESTAS</span>
                    <h2>Cotizaciones asociadas</h2>
                  </div>
                  <span className="muted-count">{quotes.length} propuestas</span>
                </div>
                {!canViewQuotes ? (
                  <div className="inventory-empty">Tu perfil no permite consultar cotizaciones.</div>
                ) : quotes.length ? (
                  <div className="customer-history-list">
                    {quotes.map((quote) => (
                      <article key={quote.id}>
                        <span>
                          <b>{quote.quote_code}</b>
                          <small>
                            {formatDate(quote.created_at)} · Estado: {quote.status}
                          </small>
                        </span>
                        <strong>{quote.selected_total == null ? 'Por confirmar' : formatMoney(quote.selected_total)}</strong>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="inventory-empty">Sin cotizaciones asociadas a este cliente.</div>
                )}
              </section>
            </div>
          </div>
          <section className="panel" style={{ marginTop: '16px' }}>
            <VisualCorpVault embeddedCustomerId={selectedCustomer.id} compact />
          </section>
          <ChatterDrawer360
            open={showChatter360}
            onClose={() => setShowChatter360(false)}
            recordType="customer"
            recordId={selectedCustomer.id}
            recordTitle={selectedCustomer.name}
            recordSubtitle={selectedCustomer.documentReference ? `RUC/CI: ${selectedCustomer.documentReference}` : selectedCustomer.email || 'Cliente Visual Corp'}
            recordPhone={selectedCustomer.phone}
            recordStage={selectedCustomerStats.balanceDue > 0 ? 'Saldo pendiente' : 'Cuenta al día'}
          />
          {detailLoading && <p className="customer-history-loading">Actualizando el historial completo…</p>}
        </>
      ) : (
        <>
          <div className="customer-directory-stats customer-directory-stats-6" aria-label="Métricas ejecutivas de clientes y CRM">
            <article className="panel customer-directory-stat">
              <span>
                <Users size={16} />
              </span>
              <div>
                <small>Total Clientes</small>
                <b>{loading ? '…' : customers.length}</b>
                <em>{globalCrmKpis.corporateCount} empresas / RUC</em>
              </div>
            </article>
            <article className="panel customer-directory-stat">
              <span>
                <Award size={16} />
              </span>
              <div>
                <small>Activos / VIP</small>
                <b>{loading ? '…' : `${globalCrmKpis.activeBuyers} (${globalCrmKpis.vipBuyers} VIP)`}</b>
                <em>Con compras confirmadas</em>
              </div>
            </article>
            <article className="panel customer-directory-stat">
              <span>
                <TrendingUp size={16} />
              </span>
              <div>
                <small>Facturación LTV</small>
                <b>{loading ? '…' : formatMoney(globalCrmKpis.totalLtv)}</b>
                <em>Ticket prom.: {formatMoney(globalCrmKpis.avgTicket)}</em>
              </div>
            </article>
            <article className="panel customer-directory-stat">
              <span className="is-amber">
                <Wallet size={16} />
              </span>
              <div>
                <small>Saldo por Cobrar</small>
                <b>{loading ? '…' : formatMoney(globalCrmKpis.totalReceivable)}</b>
                <em>{globalCrmKpis.withBalanceCount} clientes con saldo</em>
              </div>
            </article>
            <article className="panel customer-directory-stat">
              <span className="is-violet">
                <Percent size={16} />
              </span>
              <div>
                <small>Descuentos Otorgados</small>
                <b>{loading ? '…' : formatMoney(globalCrmKpis.totalDiscounts)}</b>
                <em>En ventas vinculadas</em>
              </div>
            </article>
            <article className="panel customer-directory-stat">
              <span className="is-blue">
                <FileText size={16} />
              </span>
              <div>
                <small>Conversión Cotizaciones</small>
                <b>{loading ? '…' : `${globalCrmKpis.quoteConversionPct}%`}</b>
                <em>{globalCrmKpis.totalQuotesCount} propuestas totales</em>
              </div>
            </article>
          </div>

          {showAddForm && (
            <form className="panel customer-add-panel" onSubmit={save}>
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">NUEVO REGISTRO</span>
                  <h2>Datos de contacto</h2>
                  <p>Guarda primero lo esencial; puedes completar la ficha después.</p>
                </div>
                <UserRoundPlus size={19} />
              </div>
              <div className="customer-add-primary-fields">
                <label>
                  Nombre o razón social *
                  <input
                    autoFocus
                    required
                    maxLength={160}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Nombre del cliente"
                  />
                </label>
                <label>
                  Teléfono
                  <input
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Número de contacto"
                  />
                </label>
                <label>
                  Correo electrónico
                  <input
                    autoComplete="email"
                    type="email"
                    value={form.email}
                    maxLength={254}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="correo@ejemplo.com"
                  />
                </label>
              </div>
              <details className="customer-add-more">
                <summary>Agregar datos comerciales y de seguimiento</summary>
                <div className="customer-add-extra-fields">
                  <label>
                    Cédula o RUC
                    <input maxLength={40} autoComplete="off" value={form.documentReference} onChange={(e) => setForm({ ...form, documentReference: e.target.value })} />
                  </label>
                  <label>
                    Tipo de cliente
                    <select value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value })}>
                      <option value="">Sin clasificar</option>
                      {CUSTOMER_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Empresa o institución
                    <input
                      maxLength={160}
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                      placeholder="Nombre de la organización"
                    />
                  </label>
                  <label>
                    Persona de contacto
                    <input
                      maxLength={160}
                      value={form.contactPerson}
                      onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                      placeholder="Nombre de quien coordina"
                    />
                  </label>
                  <label>
                    Ciudad
                    <input maxLength={120} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Ciudad" />
                  </label>
                  <label>
                    Origen o referencia
                    <input
                      maxLength={160}
                      value={form.source}
                      onChange={(e) => setForm({ ...form, source: e.target.value })}
                      placeholder="Referido, redes sociales, web…"
                    />
                  </label>
                  <label>
                    Canal preferido
                    <select value={form.preferredChannel} onChange={(e) => setForm({ ...form, preferredChannel: e.target.value })}>
                      <option value="">Sin especificar</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="phone">Llamada</option>
                      <option value="email">Correo</option>
                    </select>
                  </label>
                  <label>
                    Intereses y preferencias
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={form.interests}
                      onChange={(e) => setForm({ ...form, interests: e.target.value })}
                      placeholder="Productos, colores, acabados o necesidades comentadas"
                    />
                  </label>
                  <label>
                    Etiquetas
                    <input
                      maxLength={1200}
                      value={form.tags}
                      onChange={(e) => setForm({ ...form, tags: e.target.value })}
                      placeholder="frecuente, empresa, eventos"
                    />
                  </label>
                  <label>
                    Notas
                    <textarea rows={3} maxLength={4000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </label>
                </div>
              </details>
              <div className="customer-add-actions">
                <button className="button button-dark" type="submit" disabled={!canEdit}>
                  <UserRoundPlus size={15} /> Guardar cliente
                </button>
                <button className="button button-outline" type="button" onClick={() => setShowAddForm(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <section className="panel customer-directory-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SEGMENTACIÓN Y DIRECTORIO CRM</span>
                <h2>Busca, filtra por comportamiento y abre una ficha 360°</h2>
              </div>
              <span className="customer-result-count">{loading ? 'Cargando…' : `${visible.length} de ${customers.length}`}</span>
            </div>
            <div className="customer-directory-toolbar">
              <label className="search-box">
                <Search size={16} />
                <input
                  aria-label="Buscar clientes"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Nombre, teléfono, cédula/RUC, empresa, correo, tipo o etiqueta"
                />
              </label>
              <label className="customer-sort-control">
                <span>Tipo de cliente</span>
                <select value={customerTypeFilter} onChange={(event) => setCustomerTypeFilter(event.target.value)}>
                  <option value="all">Todos</option>
                  {CUSTOMER_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="customer-sort-control">
                <span>Ordenar</span>
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
                  <option value="recent">Más recientes</option>
                  <option value="ltv">Mayor facturación (LTV)</option>
                  <option value="purchases">Más compras realizadas</option>
                  <option value="balance">Mayor saldo por cobrar</option>
                  <option value="name">Nombre A–Z</option>
                </select>
              </label>
            </div>
            <div className="customer-contact-filters" role="group" aria-label="Segmentar clientes">
              {(
                [
                  ['all', 'Todos', customers.length],
                  ['vip', 'VIP / Frecuentes', globalCrmKpis.vipBuyers],
                  ['with_balance', 'Con saldo por cobrar', globalCrmKpis.withBalanceCount],
                  ['with_quotes', 'Con cotizaciones', globalCrmKpis.withQuotesCount],
                  ['corporate', 'Empresas / RUC', globalCrmKpis.corporateCount],
                  ['inactive', 'Sin compra +60d', globalCrmKpis.inactive60dCount],
                  ['phone', 'Con teléfono', globalCrmKpis.customersWithPhone],
                  ['email', 'Con correo', globalCrmKpis.customersWithEmail],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  type="button"
                  key={key}
                  className={contactFilter === key ? 'active' : ''}
                  aria-pressed={contactFilter === key}
                  onClick={() => setContactFilter(key)}
                >
                  {label}
                  <span>{loading ? '…' : count}</span>
                </button>
              ))}
            </div>

            {loading ? (
              <div className="customer-directory-empty">
                <span className="customer-empty-icon">
                  <Users size={20} />
                </span>
                <b>Cargando clientes</b>
                <p>Estamos consultando el directorio compartido.</p>
              </div>
            ) : visible.length ? (
              <div className="customer-list">
                {visible.map((customer) => {
                  const m = customerMetricsMap.get(customer.id);
                  const isVip = Boolean(m && (m.salesCount >= 2 || m.totalSpent >= 150));
                  return (
                    <button
                      type="button"
                      className="customer-row customer-row-button"
                      key={customer.id}
                      onClick={() => selectCustomer(customer.id)}
                    >
                      <Avatar
                        name={customer.name || 'Cliente'}
                        src={customer.avatarUrl}
                        size="md"
                        badge={customer.avatarUrl ? <span className="vc-google-avatar-mark">G</span> : undefined}
                      />
                      <span className="customer-row-details">
                        <b>
                          {customer.name || 'Cliente sin nombre'}{' '}
                          {isVip && <em className="customer-vip-pill">VIP</em>}
                        </b>
                        <small>
                          {[
                            customerTypeLabel(customerTypeValue(customer)),
                            customer.preferences?.company,
                            customer.documentReference ? `RUC/CI: ${customer.documentReference}` : '',
                            customer.phone,
                            customer.email,
                            customer.preferences?.city,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Agrega un teléfono o correo a la ficha'}
                        </small>
                        <span className="customer-tag-list">
                          {m && m.salesCount > 0 && (
                            <em className="is-metric-ltv">
                              {m.salesCount} compra{m.salesCount === 1 ? '' : 's'} · {formatMoney(m.totalSpent)}
                            </em>
                          )}
                          {m && m.balanceDue > 0.009 && (
                            <em className="is-metric-balance">Por cobrar: {formatMoney(m.balanceDue)}</em>
                          )}
                          {m && m.quotesCount > 0 && (
                            <em className="is-metric-quotes">{m.quotesCount} cotiz.</em>
                          )}
                          {(customer.tags || []).slice(0, 3).map((tag) => (
                            <em key={tag}>{tag}</em>
                          ))}
                          {(customer.tags || []).length > 3 && <em>+{(customer.tags || []).length - 3}</em>}
                        </span>
                      </span>
                      <span className="customer-row-open">
                        <small>
                          {m?.lastPurchaseAt
                            ? `Últ. compra ${formatDate(m.lastPurchaseAt)}`
                            : `Agregado ${formatDate(customer.createdAt)}`}
                        </small>
                        <b>
                          Abrir ficha 360° <span aria-hidden="true">→</span>
                        </b>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="customer-directory-empty">
                <span className="customer-empty-icon">
                  <Search size={20} />
                </span>
                <b>{customers.length ? 'No encontramos clientes' : 'Aún no hay clientes'}</b>
                <p>
                  {customers.length
                    ? 'Prueba con otro término o cambia el segmento.'
                    : 'Puedes agregar una ficha aquí o registrar al cliente desde el POS.'}
                </p>
                {(term || contactFilter !== 'all' || customerTypeFilter !== 'all') && (
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => {
                      setTerm('');
                      setContactFilter('all');
                      setCustomerTypeFilter('all');
                    }}
                  >
                    Limpiar búsqueda y filtros
                  </button>
                )}
                {!customers.length && canEdit && (
                  <button type="button" className="button button-dark" onClick={() => setShowAddForm(true)}>
                    <Plus size={15} /> Agregar primer cliente
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}
      {!selectedCustomer && (
        <div className="notice-box">
          <span>
            <Users size={17} />
          </span>
          <div>
            <b>Historial basado en registros reales</b>
            <p>
              Las compras, descuentos comerciales, saldos pendientes y cotizaciones aparecen cuando están vinculadas a una ficha de cliente. Las preferencias y seguimientos se guardan en la base compartida.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
