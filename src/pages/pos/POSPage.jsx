import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag,
  Clock,
  Calendar,
  Users,
  Layers,
  FileText,
  DollarSign,
  TrendingUp,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Printer,
  Search,
  Lock,
  Unlock,
  ShieldCheck,
  CreditCard,
  Building2,
  Phone,
  Package,
  Wrench,
  Percent,
  PauseCircle,
  PlayCircle,
  Truck,
  UploadCloud,
  Minus,
  Sparkles,
  ArrowRight,
  Hash,
  FileCheck,
  Volume2,
  VolumeX,
  Keyboard,
  Tv,
  Tag,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { inferProductionAreas, PRODUCTION_AREAS } from '../../lib/productionWorkflow';
import {
  loadPOSStore,
  savePOSStoreLocal,
  fetchRemotePOSStore,
  subscribePOSRealtime,
  onSyncStatusChange,
  getPOSSession,
  logoutPOSSession,
  getActiveCashShift,
  openCashShift,
  closeCashShift,
  createPOSOrder,
  createPOSExpense,
  deletePOSExpense,
  parkPOSSale,
  deleteParkedSale,
  calculateDailyReconciliation,
  calculateWeeklyBalance,
  calculateDueAlerts,
  toISODate,
  getDayNameSpanish,
  getMondayOfWeek,
  getISOWeekCode,
  getRoleCapabilities,
  createAdminPOSSession,
  getSyncHealth
} from '../../lib/posStore';
import { useAuth } from '../../store';
import { hasSupabase } from '../../lib/supabase';
import {
  playSuccessSound,
  playParkSound,
  playWarningSound,
  toggleAudioMute,
  isAudioMuted
} from '../../lib/posAudio';
import { POSLockScreen } from './POSLockScreen';
import { POSReceiptModal } from './POSReceiptModal';
import { POSWorkOrderModal } from './POSWorkOrderModal';
import { POSArtProofModal } from './POSArtProofModal';
import { POSProductionKanban } from './POSProductionKanban';
import { POSCustomerCRM } from './POSCustomerCRM';
import { POSInventoryMaterials } from './POSInventoryMaterials';
import { POSProductManager } from './POSProductManager';
import { POSPaymentCollectionModal } from './POSPaymentCollectionModal';
import { POSSRIInvoiceModal } from './POSSRIInvoiceModal';
import { POSAdvisorsManagement } from './POSAdvisorsManagement';
import { POSPurchaseOrdersManager } from './POSPurchaseOrdersManager';
import { POSKeyboardShortcutsModal } from './POSKeyboardShortcutsModal';
import { POSPackageLabelModal } from './POSPackageLabelModal';
import { POSWorkshopMasterBillboard } from './POSWorkshopMasterBillboard';
import { POSStationWorkspaces } from './POSStationWorkspaces';
import { POSProductionControl } from './POSProductionControl';
import { SupabaseFileUploader } from '../../components/studio/SupabaseFileUploader';
import { POSProductQuickMatrix } from './components/POSProductQuickMatrix';
import { useToast } from '../../components/studio/Toast';
import { markQuoteRequestConverted } from '../../lib/siteRepository';
import { searchPOSCustomers, searchPOSOrders, searchPOSProducts } from '../../lib/posSearch';
import { getGoogleMapsEmbedUrl, getGoogleMapsOpenUrl, isGoogleMapsUrl } from '../../lib/maps';

export function POSPage({ initialTab = 'cashier' }) {
  const toast = useToast();
  const { login: loginAdmin, isAdmin: hasAdminSession, user: authUser, userProfile, authMode, authLoading } = useAuth();
  const [store, setStore] = useState(loadPOSStore);
  const [session, setSession] = useState(() => {
    const cached = getPOSSession();
    return hasSupabase && cached?.isAdmin ? null : cached;
  });
  const [syncStatus, setSyncStatus] = useState('synced');
  const [syncHealth, setSyncHealth] = useState(getSyncHealth);

  const handlePOSAuthenticated = (nextSession) => {
    if (nextSession?.isSupabaseAdmin) {
      setSession(createAdminPOSSession(nextSession));
      return;
    }
    setSession(nextSession);
  };

  const handleSupabaseAdminLogin = async (credentials) => {
    const result = await loginAdmin(credentials);
    if (!result.ok) return result;
    return {
      ok: true,
      session: createAdminPOSSession({ email: credentials.email, name: userProfile?.display_name || 'Administrador General' })
    };
  };

  useEffect(() => {
    if (!hasSupabase || authLoading) return;
    if (hasAdminSession && authUser) {
      setSession((current) => current?.isAdmin && current.authUserId === authUser.id
        ? current
        : createAdminPOSSession({ ...authUser, name: userProfile?.display_name || 'Administrador General' }));
      return;
    }
    setSession((current) => {
      if (!current?.isAdmin) return current;
      logoutPOSSession();
      return null;
    });
  }, [authLoading, hasAdminSession, authUser?.id, userProfile?.display_name]);
  
  // Resolve initial tab based on role if default
  const getDefaultTabForRole = (userSession, requestedTab) => {
    const capabilities = getRoleCapabilities(userSession?.role);
    if (requestedTab && capabilities.allowedTabs.includes(requestedTab)) return requestedTab;
    return capabilities.defaultTab;
  };

  const [activeTab, setActiveTab] = useState(() => getDefaultTabForRole(getPOSSession(), initialTab));
  const roleCapabilities = useMemo(() => getRoleCapabilities(session?.role), [session?.role]);
  const canViewTab = (tab) => roleCapabilities.allowedTabs.includes(tab);
  const [activeStationArea, setActiveStationArea] = useState(() => {
    const r = getPOSSession()?.role;
    if (r === 'operador_sublimacion') return 'sublimacion';
    if (r === 'operador_corte_laser') return 'corte_laser';
    return 'impresion';
  });

  useEffect(() => {
    if (initialTab) {
      setActiveTab(getDefaultTabForRole(session, initialTab));
    }
  }, [initialTab, session?.role]);

  useEffect(() => {
    if (session && !canViewTab(activeTab)) setActiveTab(roleCapabilities.defaultTab);
  }, [session?.role, activeTab]);

  useEffect(() => {
    const preferredStation = {
      operador_impresion: 'impresion',
      operador_sublimacion: 'sublimacion',
      operador_corte_laser: 'corte_laser'
    }[session?.role];
    if (preferredStation) setActiveStationArea(preferredStation);
  }, [session?.role]);

  // Cashier Form State
  const [customerName, setCustomerName] = useState('');
  const [customerIdentification, setCustomerIdentification] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerId, setCustomerId] = useState(null);
  const [activeCustomerField, setActiveCustomerField] = useState(null);
  const [customerSuggestionIndex, setCustomerSuggestionIndex] = useState(0);
  const [jobName, setJobName] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(toISODate());
  const [executionDate, setExecutionDate] = useState(toISODate());
  const [assignedArea, setAssignedArea] = useState('impresion');
  const [involvedAreas, setInvolvedAreas] = useState(['impresion']);
  const [requiresInstallation, setRequiresInstallation] = useState(false);
  const [installationAddress, setInstallationAddress] = useState('');
  const [installationMapsUrl, setInstallationMapsUrl] = useState('');
  const [installationDate, setInstallationDate] = useState(toISODate());
  const [fieldMeasurementsNotes, setFieldMeasurementsNotes] = useState('');
  const [pickupLocation, setPickupLocation] = useState('Matriz Gigaprint - Av. García Moreno y 9 de Octubre, Milagro');
  const [productionPriority, setProductionPriority] = useState('normal');
  const [productionNotes, setProductionNotes] = useState('');
  const [artUrl, setArtUrl] = useState('');
  const [showUploader, setShowUploader] = useState(false);
  const [applyIVA, setApplyIVA] = useState(false);
  const [shippingCost, setShippingCost] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [notes, setNotes] = useState('');
  const [sourceQuoteRequestId, setSourceQuoteRequestId] = useState(null);
  const [sourceQuoteNumber, setSourceQuoteNumber] = useState('');

  // Product Category & Search in Configurator
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [favoriteProductIds, setFavoriteProductIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gigaprint-pos-favorites-v1') || '[]'); } catch { return []; }
  });
  const [recentProductIds, setRecentProductIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gigaprint-pos-recents-v1') || '[]'); } catch { return []; }
  });

  // Cart & Line Items
  const [cartItems, setCartItems] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemWidthCm, setItemWidthCm] = useState('');
  const [itemHeightCm, setItemHeightCm] = useState('');
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemFinishing, setItemFinishing] = useState('none');
  const [itemEyeletCount, setItemEyeletCount] = useState(4);
  const [itemEyeletType, setItemEyeletType] = useState('pequenos');
  const [customPriceOverride, setCustomPriceOverride] = useState('');

  // Payment Methods Split
  const [payments, setPayments] = useState([{ method: 'cash', amount: '', tenderedAmount: '', changeGiven: 0, bankName: 'Banco Pichincha', referenceNumber: '' }]);

  // Modals & Popups
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [workOrderData, setWorkOrderData] = useState(null);
  const [artProofOrder, setArtProofOrder] = useState(null);
  const [collectionOrder, setCollectionOrder] = useState(null);
  const [sriOrder, setSriOrder] = useState(null);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftAction, setShiftAction] = useState('open'); // 'open' | 'close'
  const [shiftCashAmount, setShiftCashAmount] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [isMuted, setIsMuted] = useState(isAudioMuted);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Miscellaneous / Freeform Custom Item Modal State
  const [isFreeItemModalOpen, setIsFreeItemModalOpen] = useState(false);
  const [freeItemName, setFreeItemName] = useState('');
  const [freeItemPrice, setFreeItemPrice] = useState('');
  const [freeItemQty, setFreeItemQty] = useState(1);
  const [freeItemCategory, setFreeItemCategory] = useState('Servicios Especiales');
  const [freeItemNotes, setFreeItemNotes] = useState('');

  // Orders Tab Filters
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState('all');
  const [orderStageFilter, setOrderStageFilter] = useState('all');

  // Load and Subscribe
  useEffect(() => {
    fetchRemotePOSStore().then((remote) => setStore(remote));
    const unsubscribeSync = onSyncStatusChange((st) => { setSyncStatus(st); setSyncHealth(getSyncHealth()); });
    const syncHealthTimer = window.setInterval(() => setSyncHealth(getSyncHealth()), 5000);
    const unsubscribeRealtime = subscribePOSRealtime((remote) => setStore(remote));

    return () => {
      unsubscribeSync();
      unsubscribeRealtime();
      window.clearInterval(syncHealthTimer);
    };
  }, [session?.id]);

  useEffect(() => {
    try {
      const rawDraft = localStorage.getItem('gigaprint-pos-quote-draft-v1');
      if (!rawDraft) return;
      const draft = JSON.parse(rawDraft);
      setSourceQuoteRequestId(draft.quoteRequestId || null);
      setSourceQuoteNumber(draft.quoteNumber || '');
      setCustomerName(draft.customerName || '');
      setCustomerPhone(draft.customerPhone || '');
      setJobName(draft.jobName || '');
      setNotes(draft.notes || '');
      setApplyIVA(Boolean(draft.applyIVA));
      setCartItems(Array.isArray(draft.cartItems) ? draft.cartItems : []);
      setActiveTab('cashier');
      localStorage.removeItem('gigaprint-pos-quote-draft-v1');
      toast.success(`Cotización ${draft.quoteNumber || ''} cargada en el POS.`);
    } catch {
      localStorage.removeItem('gigaprint-pos-quote-draft-v1');
    }
  }, []);

  // Update session listener
  useEffect(() => {
    setSession(getPOSSession());
  }, []);

  // Active Cash Shift for current advisor
  const currentAdvisorId = session?.id || 'adv-vicky';
  const activeShift = useMemo(() => {
    return roleCapabilities.canOpenCash ? getActiveCashShift(store.shifts || [], currentAdvisorId) : null;
  }, [store.shifts, currentAdvisorId, roleCapabilities.canOpenCash]);

  // Selected Customer Resolution & Debt Calculation
  const selectedCustomerObj = useMemo(() => {
    if (customerId) return (store.customers || []).find((c) => c.id === customerId) || null;
    if (customerIdentification) return (store.customers || []).find((c) => c.identification === customerIdentification) || null;
    if (customerName) return (store.customers || []).find((c) => c.name.toLowerCase() === customerName.toLowerCase()) || null;
    return null;
  }, [store.customers, customerId, customerIdentification, customerName]);

  const activeCustomerQuery = activeCustomerField === 'identification'
    ? customerIdentification
    : activeCustomerField === 'phone'
      ? customerPhone
      : customerName;
  const customerSuggestions = useMemo(
    () => activeCustomerField ? searchPOSCustomers(store.customers || [], activeCustomerQuery) : [],
    [store.customers, activeCustomerField, activeCustomerQuery],
  );
  const installationMapEmbedUrl = useMemo(
    () => getGoogleMapsEmbedUrl(installationMapsUrl, installationAddress),
    [installationMapsUrl, installationAddress],
  );

  const customerDebt = useMemo(() => {
    if (!customerName && !customerId) return 0;
    return (store.orders || [])
      .filter((o) => (o.customerId === customerId || (o.customerName && o.customerName.toLowerCase() === customerName.toLowerCase())) && Number(o.balanceDue) > 0.05 && o.status !== 'cancelled')
      .reduce((sum, o) => sum + Number(o.balanceDue || 0), 0);
  }, [store.orders, customerId, customerName]);

  useEffect(() => {
    setInvolvedAreas(inferProductionAreas(cartItems, { assignedArea, requiresInstallation }));
  }, [cartItems, assignedArea, requiresInstallation]);

  // Due date alerts
  const dueAlerts = useMemo(() => {
    return calculateDueAlerts(store.orders || []);
  }, [store.orders]);

  // Filtered Orders for the "Cartera & Pedidos" Tab
  const filteredOrdersList = useMemo(() => {
    return searchPOSOrders(store.orders || [], orderSearchTerm).filter((o) => {
      const matchPay = orderPaymentFilter === 'all' || o.paymentStatus === orderPaymentFilter;
      const matchStage = orderStageFilter === 'all' || o.productionStage === orderStageFilter;

      return matchPay && matchStage;
    });
  }, [store.orders, orderSearchTerm, orderPaymentFilter, orderStageFilter]);

  // Unique product categories
  const productCategories = useMemo(() => {
    const set = new Set();
    (store.products || []).forEach((p) => {
      if (p.category && p.isActive !== false) set.add(p.category);
    });
    return ['all', ...Array.from(set)];
  }, [store.products]);

  // Filtered products for dropdown
  const filteredProductOptions = useMemo(() => {
    return searchPOSProducts(store.products || [], productSearch, selectedCategory);
  }, [store.products, selectedCategory, productSearch]);

  // Selected Product Reference
  const selectedProduct = useMemo(() => {
    if (selectedProductId) {
      const found = (store.products || []).find((p) => p.id === selectedProductId);
      if (found) return found;
    }
    return filteredProductOptions[0] || (store.products || [])[0] || null;
  }, [store.products, selectedProductId, filteredProductOptions]);

  const quickProducts = useMemo(() => {
    const byId = new Map((store.products || []).map((product) => [product.id, product]));
    const ids = [...favoriteProductIds, ...recentProductIds].filter((id, index, all) => all.indexOf(id) === index);
    return ids.map((id) => byId.get(id)).filter((product) => product && product.isActive !== false).slice(0, 10);
  }, [store.products, favoriteProductIds, recentProductIds]);

  const selectQuickProduct = (product) => {
    setSelectedProductId(product.id);
    setRecentProductIds((current) => {
      const next = [product.id, ...current.filter((id) => id !== product.id)].slice(0, 8);
      localStorage.setItem('gigaprint-pos-recents-v1', JSON.stringify(next));
      return next;
    });
  };

  const toggleFavoriteProduct = (productId) => {
    setFavoriteProductIds((current) => {
      const next = current.includes(productId) ? current.filter((id) => id !== productId) : [productId, ...current].slice(0, 8);
      localStorage.setItem('gigaprint-pos-favorites-v1', JSON.stringify(next));
      return next;
    });
  };

  // Calculation of Single Line Item
  const computedItem = useMemo(() => {
    if (!selectedProduct) return { areaM2: 0, unitPrice: 0, totalPrice: 0 };

    const isArea = selectedProduct.calcType === 'area' || selectedProduct.calcType === 'm2';
    const w = Number(itemWidthCm) || 0;
    const h = Number(itemHeightCm) || 0;
    const qty = Math.max(1, Number(itemQuantity) || 1);
    const area = isArea && w > 0 && h > 0 ? (w / 100) * (h / 100) : 0;

    const tierBasis = isArea ? area * qty : qty;
    const tiers = [...(selectedProduct.priceTiers || [])].sort((a, b) => Number(a.qty || a.minQty || 0) - Number(b.qty || b.minQty || 0));
    const activeTier = tiers.reduce((match, tier) => tierBasis >= Number(tier.qty || tier.minQty || 0) ? tier : match, tiers[0]);
    let baseUnitPrice = customPriceOverride !== ''
      ? Number(customPriceOverride)
      : Number(activeTier?.price ?? activeTier?.pvp ?? activeTier?.unitPrice ?? selectedProduct.basePrice ?? 0);

    let finishingCost = 0;
    if (itemFinishing === 'ojales_pequenos') {
      finishingCost += (Number(itemEyeletCount) || 4) * 0.30;
    } else if (itemFinishing === 'ojales_grandes') {
      finishingCost += (Number(itemEyeletCount) || 4) * 0.50;
    } else if (itemFinishing === 'bolsillo') {
      finishingCost += 4.00;
    }

    const isTierTotal = selectedProduct.calcType === 'tier-total' || selectedProduct.calcType === 'scale-total';
    const itemBaseTotal = isArea ? area * baseUnitPrice * qty : isTierTotal ? baseUnitPrice : baseUnitPrice * qty;
    const totalPrice = Number((itemBaseTotal + finishingCost * qty).toFixed(2));

    return {
      areaM2: Number(area.toFixed(4)),
      unitPrice: baseUnitPrice,
      finishingCost,
      totalPrice
    };
  }, [selectedProduct, itemWidthCm, itemHeightCm, itemQuantity, itemFinishing, itemEyeletCount, customPriceOverride]);

  // Add Item to Cart
  const handleAddToCart = () => {
    if (!selectedProduct) return;
    if ((selectedProduct.calcType === 'area' || selectedProduct.calcType === 'm2') && (!itemWidthCm || !itemHeightCm)) {
      toast.warning('Ingresa el ancho y alto en centímetros para productos calculados por m²');
      return;
    }

    const newItem = {
      id: `cart-${Date.now()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      category: selectedProduct.category,
      calcType: selectedProduct.calcType,
      widthCm: Number(itemWidthCm) || null,
      heightCm: Number(itemHeightCm) || null,
      areaM2: computedItem.areaM2 || null,
      quantity: Number(itemQuantity) || 1,
      unitPrice: computedItem.unitPrice,
      finishing: itemFinishing,
      eyeletCount: itemFinishing.includes('ojales') ? Number(itemEyeletCount) : 0,
      eyeletType: itemEyeletType,
      totalPrice: computedItem.totalPrice
    };

    setCartItems([...cartItems, newItem]);
    setItemWidthCm('');
    setItemHeightCm('');
    setItemQuantity(1);
    setItemFinishing('none');
    setCustomPriceOverride('');
  };

  // Remove Item from Cart
  const handleRemoveFromCart = (index) => {
    setCartItems(cartItems.filter((_, idx) => idx !== index));
  };

  // Financial Liquidation Totals
  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, itm) => sum + Number(itm.totalPrice || 0), 0);
  }, [cartItems]);

  const discountAmount = useMemo(() => {
    const pct = Math.max(0, Math.min(100, Number(discountPercent) || 0));
    return Number(((subtotal * pct) / 100).toFixed(2));
  }, [subtotal, discountPercent]);

  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
  const taxRate = applyIVA ? 0.15 : 0;
  const taxAmount = Number((subtotalAfterDiscount * taxRate).toFixed(2));
  const totalAmount = Number((subtotalAfterDiscount + taxAmount + (Number(shippingCost) || 0)).toFixed(2));

  const totalDeposited = useMemo(() => {
    return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payments]);

  const balanceDue = Number(Math.max(0, totalAmount - totalDeposited).toFixed(2));
  const changeDue = Number(payments.reduce((sum, payment) => sum + Number(payment.changeGiven || 0), 0).toFixed(2));

  // Quick cash amount helper
  const handleQuickCash = (amount) => {
    const updated = [...payments];
    updated[0].method = 'cash';
    updated[0].amount = String(Math.min(Number(amount), totalAmount));
    updated[0].tenderedAmount = String(amount);
    updated[0].changeGiven = Number(Math.max(0, Number(amount) - totalAmount).toFixed(2));
    setPayments(updated);
  };

  // Auto-fill customer details from CRM suggestion
  const handleSelectCustomerSuggestion = (cust) => {
    setCustomerName(cust.name);
    setCustomerIdentification(cust.identification || '');
    setCustomerPhone(cust.phone || '');
    setCustomerId(cust.id);
    if (!installationAddress && cust.address) setInstallationAddress(cust.address);
    setActiveCustomerField(null);
    setCustomerSuggestionIndex(0);
  };

  const handleCustomerFieldChange = (field, value) => {
    if (field === 'name') setCustomerName(value);
    if (field === 'identification') setCustomerIdentification(value);
    if (field === 'phone') setCustomerPhone(value);
    if (customerId) setCustomerId(null);
    setActiveCustomerField(field);
    setCustomerSuggestionIndex(0);
  };

  const handleCustomerSearchKeyDown = (event) => {
    if (!customerSuggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCustomerSuggestionIndex((index) => (index + 1) % customerSuggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCustomerSuggestionIndex((index) => (index - 1 + customerSuggestions.length) % customerSuggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      handleSelectCustomerSuggestion(customerSuggestions[customerSuggestionIndex].customer);
    } else if (event.key === 'Escape') {
      setActiveCustomerField(null);
    }
  };

  // Broadcast active cart state to secondary customer display in real time
  useEffect(() => {
    const payload = {
      advisorName: session?.name || 'Ventas',
      customerName,
      cartItems,
      totalAmount,
      subtotal,
      discountAmount,
      applyIVA,
      taxAmount,
      status: receiptOrder ? 'completed' : 'active',
      orderNumber: receiptOrder?.orderNumber || ''
    };
    try {
      localStorage.setItem('gigaprint_pos_customer_display', JSON.stringify(payload));
      const channel = new BroadcastChannel('gigaprint_pos_display_channel');
      channel.postMessage(payload);
      channel.close();
    } catch (e) {
      // BroadcastChannel fallback handled by storage event
    }
  }, [session?.name, customerName, cartItems, totalAmount, subtotal, discountAmount, applyIVA, taxAmount, receiptOrder]);

  // Park Sale (Guardar en espera)
  const handleParkSale = () => {
    if (cartItems.length === 0) {
      toast.warning('El carrito está vacío para poner en espera.');
      return;
    }
    playParkSound();
    const res = parkPOSSale(store, {
      advisorId: currentAdvisorId,
      customerName: customerName.trim() || 'Cliente en espera',
      customerPhone: customerPhone.trim(),
      cartData: {
        cartItems,
        customerName,
        customerIdentification,
        customerPhone,
        customerId,
        jobName,
        deliveryDate,
        applyIVA,
        shippingCost,
        discountPercent,
        notes,
        installationAddress,
        installationMapsUrl,
      },
      totalAmount,
      notes: notes || 'Venta pausada'
    });

    if (res.ok) {
      setStore(res.updatedStore);
      handleClearCart();
      toast.info('Venta guardada en espera correctamente.');
    }
  };

  // Restore Parked Sale
  const handleRestoreParkedSale = (parked) => {
    const data = parked.cartData || {};
    setCartItems(data.cartItems || []);
    setCustomerName(data.customerName || '');
    setCustomerIdentification(data.customerIdentification || '');
    setCustomerPhone(data.customerPhone || '');
    setCustomerId(data.customerId || null);
    setJobName(data.jobName || '');
    setDeliveryDate(data.deliveryDate || toISODate());
    setApplyIVA(Boolean(data.applyIVA));
    setShippingCost(data.shippingCost || 0);
    setDiscountPercent(data.discountPercent || 0);
    setNotes(data.notes || '');
    setInstallationAddress(data.installationAddress || '');
    setInstallationMapsUrl(data.installationMapsUrl || '');

    const res = deleteParkedSale(store, parked.id);
    if (res.ok) {
      setStore(res.updatedStore);
      toast.success('Venta reanudada en el mostrador.');
    }
  };

  // Clear Entire Cashier Form
  const handleClearCart = () => {
    setCartItems([]);
    setCustomerName('');
    setCustomerIdentification('');
    setCustomerPhone('');
    setCustomerId(null);
    setActiveCustomerField(null);
    setJobName('');
    setDeliveryDate(toISODate());
    setApplyIVA(false);
    setShippingCost(0);
    setDiscountPercent(0);
    setDiscountReason('');
    setNotes('');
    setSourceQuoteRequestId(null);
    setSourceQuoteNumber('');
    setRequiresInstallation(false);
    setInstallationAddress('');
    setInstallationMapsUrl('');
    setFieldMeasurementsNotes('');
    setArtUrl('');
    setAssignedArea('impresion');
    setInvolvedAreas(['impresion']);
    setPayments([{ method: 'cash', amount: '', tenderedAmount: '', changeGiven: 0, bankName: 'Banco Pichincha', referenceNumber: '' }]);
  };

  // Submit and Create Final POS Order
  const handleSubmitOrder = () => {
    if (isSubmittingOrder) return;
    if (!roleCapabilities.canOpenCash) {
      toast.error('Tu rol pertenece a coordinación o producción y no puede registrar ventas ni abrir caja.');
      setActiveTab(roleCapabilities.defaultTab);
      return;
    }
    if (!activeShift) {
      toast.warning('Abre un turno de caja antes de registrar una venta.');
      return;
    }
    if (cartItems.length === 0) {
      toast.warning('Agrega al menos un producto al carrito antes de registrar.');
      return;
    }
    if (!customerName.trim()) {
      toast.warning('Ingresa el nombre del cliente o empresa.');
      return;
    }
    if (!customerPhone.trim()) {
      toast.warning('Ingresa un teléfono de contacto para notificaciones y seguimiento.');
      return;
    }
    if (!involvedAreas.length) {
      toast.warning('Selecciona al menos un área de producción.');
      return;
    }
    if (requiresInstallation && !installationAddress.trim()) {
      toast.warning('Indica la dirección de la instalación para generar la ruta y la orden de trabajo.');
      return;
    }
    if (requiresInstallation && installationMapsUrl && !isGoogleMapsUrl(installationMapsUrl)) {
      toast.warning('El enlace de instalación debe ser un enlace HTTPS válido de Google Maps.');
      return;
    }
    if (Number(discountPercent) > 0 && !discountReason.trim()) {
      toast.warning('Indica el motivo del descuento para mantener la auditoría de caja.');
      return;
    }
    if (Number(discountPercent) > roleCapabilities.maxDiscountPercent) {
      toast.warning(`Tu rol puede aplicar hasta ${roleCapabilities.maxDiscountPercent}% de descuento. Solicita aprobación de un encargado.`);
      return;
    }
    if (payments.some((payment) => Number(payment.amount) < 0 || (payment.method !== 'cash' && Number(payment.amount) > totalAmount))) {
      toast.warning('Revisa los montos de pago; hay un valor inválido o superior al total.');
      return;
    }

    setIsSubmittingOrder(true);

    const orderData = {
      advisorId: currentAdvisorId,
      customerId,
      customerName: customerName.trim(),
      customerIdentification: customerIdentification.trim(),
      customerPhone: customerPhone.trim(),
      jobName: jobName.trim() || `Trabajo ${cartItems[0]?.productName}`,
      deliveryDate,
      executionDate: executionDate || deliveryDate,
      assignedArea: assignedArea || 'impresion',
      involvedAreas,
      requiresInstallation: Boolean(requiresInstallation),
      installationAddress: installationAddress.trim(),
      installationMapsUrl: installationMapsUrl.trim(),
      installationDate: installationDate || deliveryDate,
      fieldMeasurementsNotes: fieldMeasurementsNotes.trim(),
      pickupLocation,
      productionPriority,
      productionNotes,
      artUrl,
      artApproved: false,
      productionStage: 'preprensa',
      stationStage: 'pendiente',
      subtotal,
      discountPercent: Number(discountPercent) || 0,
      discountAmount,
      discountReason,
      taxRate,
      taxAmount,
      shippingCost: Number(shippingCost) || 0,
      totalAmount,
      depositAmount: totalDeposited,
      balanceDue,
      notes,
      sourceQuoteRequestId,
      sourceQuoteNumber,
      items: cartItems,
      payments
    };

    const res = createPOSOrder(store, orderData);
    if (res.ok) {
      playSuccessSound();
      setStore(res.updatedStore);
      setReceiptOrder(res.order);
      handleClearCart();
      toast.success(`Orden #${res.order.orderNumber} registrada con éxito.`);
      if (sourceQuoteRequestId) markQuoteRequestConverted(sourceQuoteRequestId, res.order.id).catch(() => {});
    } else {
      playWarningSound();
      toast.error('Error al registrar la orden: ' + res.error);
    }
    window.setTimeout(() => setIsSubmittingOrder(false), 600);
  };

  // Handler for adding Miscellaneous / Freeform Custom Item
  const handleAddFreeItem = (e) => {
    e.preventDefault();
    if (!freeItemName.trim()) {
      toast.warning('Ingresa el nombre o concepto del ítem.');
      return;
    }
    const unitP = Number(freeItemPrice) || 0;
    const qty = Math.max(1, Number(freeItemQty) || 1);
    const itemTotal = Number((unitP * qty).toFixed(2));

    setCartItems((prev) => [
      ...prev,
      {
        id: `cart-free-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        productName: freeItemName.trim(),
        category: freeItemCategory || 'Servicios Especiales',
        calcType: 'unit',
        unitPrice: unitP,
        quantity: qty,
        totalPrice: itemTotal,
        notes: freeItemNotes.trim(),
        finishing: ''
      }
    ]);

    toast.success(`Ítem especial "${freeItemName.trim()}" agregado al carrito.`);
    setFreeItemName('');
    setFreeItemPrice('');
    setFreeItemQty(1);
    setFreeItemNotes('');
    setIsFreeItemModalOpen(false);
  };

  // Reorder hook from CRM
  const handleReorderFromCRM = (reorderData) => {
    setCustomerName(reorderData.customerName || '');
    setCustomerIdentification(reorderData.customerIdentification || '');
    setCustomerPhone(reorderData.customerPhone || '');
    setCustomerId(reorderData.customerId || null);
    setJobName(reorderData.jobName || '');
    setCartItems(reorderData.items.map((i, idx) => ({ ...i, id: `cart-reorder-${Date.now()}-${idx}` })));
    setActiveTab('cashier');
  };

  // Global Hardware Barcode / QR Scanner Buffer & Keyboard Shortcuts Listener
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTimestamp = Date.now();

    const handleKeyDown = (e) => {
      const now = Date.now();
      const timeDiff = now - lastKeyTimestamp;
      lastKeyTimestamp = now;

      // 1. Check for Barcode Scanner EOT (Enter key with rapid burst < 65ms per char)
      if (e.key === 'Enter') {
        if (scanBuffer.length >= 3 && timeDiff < 80) {
          const scannedCode = scanBuffer.trim();
          scanBuffer = '';

          // A. Match Order Number / Barcode
          const matchingOrder = (store.orders || []).find(
            (o) => (o.orderNumber || '').toUpperCase() === scannedCode.toUpperCase() || (o.id || '').toUpperCase() === scannedCode.toUpperCase()
          );
          if (matchingOrder) {
            toast.info(`📦 Trabajo #${matchingOrder.orderNumber} localizado mediante escáner.`);
            setSelectedOrderForReceipt(matchingOrder);
            return;
          }

          // B. Match Product SKU or Name
          const matchingProduct = (store.products || []).find(
            (p) => (p.sku && p.sku.toUpperCase() === scannedCode.toUpperCase()) || p.name.toUpperCase() === scannedCode.toUpperCase()
          );
          if (matchingProduct) {
            toast.success(`🏷️ Sustrato "${matchingProduct.name}" agregado por escáner.`);
            setCartItems((prev) => [
              ...prev,
              {
                id: `cart-scan-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                productId: matchingProduct.id,
                productName: matchingProduct.name,
                category: matchingProduct.category,
                calcType: matchingProduct.calcType,
                quantity: 1,
                unitPrice: Number(matchingProduct.basePrice || 5.0),
                totalPrice: Number(matchingProduct.basePrice || 5.0),
                finishing: ''
              }
            ]);
            return;
          }

          // C. Match Customer RUC / Cédula / Teléfono
          const matchingCustomer = (store.customers || []).find(
            (c) => (c.identification || '').toUpperCase() === scannedCode.toUpperCase() || (c.phone || '').includes(scannedCode)
          );
          if (matchingCustomer) {
            toast.success(`👤 Cliente "${matchingCustomer.name}" identificado por escáner.`);
            setCustomerId(matchingCustomer.id);
            setCustomerName(matchingCustomer.name);
            setCustomerIdentification(matchingCustomer.identification);
            setCustomerPhone(matchingCustomer.phone || '');
            return;
          }
        }
        scanBuffer = '';
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (timeDiff > 120) {
          scanBuffer = e.key;
        } else {
          scanBuffer += e.key;
        }
      }

      // 2. Global Modal and Navigation Shortcuts
      if (e.key === '?' || e.key === 'F12') {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
        return;
      }

      if (e.key === 'Escape') {
        setShowShortcutsModal(false);
        setIsShiftModalOpen(false);
        setIsFreeItemModalOpen(false);
      }

      if (activeTab !== 'cashier') return;

      if (e.key === 'F1') {
        e.preventDefault();
        const searchInput = document.getElementById('pos-customer-search-input');
        if (searchInput) searchInput.focus();
      } else if (e.key === 'F2') {
        // Quick Exact Cash
        e.preventDefault();
        handleQuickCash(totalAmount);
      } else if (e.key === 'F3') {
        // Quick Exact Transfer
        e.preventDefault();
        setPayments([{ method: 'transfer', amount: totalAmount.toFixed(2), bankName: 'Banco Pichincha', referenceNumber: '' }]);
      } else if (e.key === 'F4') {
        // Open Free Item Modal
        e.preventDefault();
        setIsFreeItemModalOpen(true);
      } else if (e.key === 'F6') {
        e.preventDefault();
        handleParkSale();
      } else if (e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        handleSubmitOrder();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, cartItems, customerName, customerIdentification, customerPhone, totalAmount, payments, store.orders, store.products, store.customers]);

  // Lock Screen Check
  if (!session) {
    return (
      <POSLockScreen
        advisors={store.advisors}
        onAuthenticated={handlePOSAuthenticated}
        onUnlockSuccess={handlePOSAuthenticated}
        onAdminAuthenticate={authMode === 'supabase' ? handleSupabaseAdminLogin : null}
        defaultAdminEmail={authUser?.email || localStorage.getItem('gigaprint-admin-email') || ''}
        existingAdmin={hasAdminSession ? {
          id: authUser?.id,
          email: authUser?.email,
          name: userProfile?.display_name || 'Administrador General',
          role: 'super_admin',
          isAdmin: true,
          isSupabaseAdmin: true,
          canOpenCash: true,
          hasSalesGoal: false,
          assignedArea: 'gerencia',
          defaultTab: 'cashier'
        } : null}
      />
    );
  }

  return (
    <div className="pos-container">
      {/* ----------------------------------------------------------------------
          TOP HEADER BAR
          ---------------------------------------------------------------------- */}
      <header className="pos-top-bar">
        <div className="pos-brand-badge">
          <div className="pos-brand-logo-mark">G</div>
          <div>
            <h1 className="pos-brand-title">
              {roleCapabilities.canOpenCash ? 'Gigaprint POS & CRM' : 'Gigaprint Coordinación de Trabajos'}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="pos-advisor-pill">
                <Users size={12} /> {session.name} ({session.role})
              </span>
              <div className={`pos-sync-pill ${syncStatus}`} title={syncHealth.pending ? `${syncHealth.pending} cambios pendientes de sincronizar` : 'Sin cambios pendientes'}>
                <span className="pos-pulse-dot" />
                <span>{syncStatus === 'synced' && !syncHealth.pending ? 'Nube Sincronizada' : (syncStatus === 'syncing' ? 'Sincronizando...' : syncHealth.pending ? `Pendiente (${syncHealth.pending})` : 'Modo Local')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pos-top-actions">
          {/* Sound Mute Toggle */}
          <button
            type="button"
            className="pos-lock-btn"
            style={{ padding: '8px 10px' }}
            onClick={() => {
              const muted = toggleAudioMute();
              setIsMuted(muted);
            }}
            title={isMuted ? 'Activar efectos de sonido' : 'Silenciar efectos de sonido'}
          >
            {isMuted ? <VolumeX size={14} style={{ color: '#ef4444' }} /> : <Volume2 size={14} style={{ color: '#10b981' }} />}
          </button>

          {/* Keyboard Shortcuts Cheat-Sheet Button */}
          <button
            type="button"
            className="pos-lock-btn"
            style={{ padding: '8px 12px', gap: '6px' }}
            onClick={() => setShowShortcutsModal(true)}
            title="Ver atajos de teclado (? / F12)"
          >
            <Keyboard size={14} /> <span style={{ fontSize: '11px', fontWeight: 800 }}>Atajos (?)</span>
          </button>

          {/* Admin Panel Return Link */}
          <Link
            to="/admin"
            className="pos-lock-btn"
            style={{ textDecoration: 'none', padding: '8px 12px', gap: '6px', color: 'inherit', display: 'flex', alignItems: 'center' }}
            title="Volver al Panel Administrativo"
          >
            <Building2 size={14} style={{ color: 'var(--pos-primary)' }} /> <span style={{ fontSize: '11px', fontWeight: 800 }}>Panel Admin</span>
          </Link>

          {/* Customer-Facing Display Launcher */}
          {roleCapabilities.canOpenCash && <a
            href="#/pos/display"
            target="_blank"
            rel="noreferrer"
            className="pos-lock-btn"
            style={{ textDecoration: 'none', padding: '8px 12px', gap: '6px', color: 'inherit', display: 'flex', alignItems: 'center' }}
            title="Abrir pantalla secundaria para el cliente"
          >
            <Tv size={14} color="#3b82f6" /> <span style={{ fontSize: '11px', fontWeight: 800 }}>2da Pantalla</span>
          </a>}

          {roleCapabilities.canOpenCash && (activeShift ? (
            <button
              type="button"
              className="pos-shift-btn open"
              onClick={() => { setShiftAction('close'); setIsShiftModalOpen(true); }}
              title="Arqueo y cierre de caja"
            >
              <DollarSign size={15} /> Turno Abierto (Arqueo)
            </button>
          ) : (
            <button
              type="button"
              className="pos-shift-btn closed"
              onClick={() => { setShiftAction('open'); setIsShiftModalOpen(true); }}
              title="Abrir nuevo turno"
            >
              <DollarSign size={15} /> Abrir Turno de Caja
            </button>
          ))}

          <button
            type="button"
            className="pos-lock-btn"
            onClick={() => { logoutPOSSession(); setSession(null); }}
            title="Bloquear terminal o cambiar de asesora"
          >
            <Lock size={14} /> Bloquear
          </button>
        </div>
      </header>

      {/* ----------------------------------------------------------------------
          DUE DATE ALERT BANNER
          ---------------------------------------------------------------------- */}
      {(dueAlerts.overdueCount > 0 || dueAlerts.dueTodayCount > 0) && (
        <div className={`pos-alert-banner ${dueAlerts.overdueCount > 0 ? 'urgent' : 'warning'}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={20} />
            <span style={{ fontSize: '13px', fontWeight: 800 }}>
              {dueAlerts.overdueCount > 0 ? `⚠️ ¡Atención! Hay ${dueAlerts.overdueCount} trabajo(s) vencido(s) en taller.` : ''}
              {dueAlerts.dueTodayCount > 0 ? ` 📦 ${dueAlerts.dueTodayCount} trabajo(s) con entrega programada para hoy.` : ''}
            </span>
          </div>
          <button
            type="button"
            className="pos-alert-btn"
            onClick={() => setActiveTab(canViewTab('kanban') ? 'kanban' : roleCapabilities.defaultTab)}
          >
            Ver en Tablero Kanban ➔
          </button>
        </div>
      )}

      {/* ----------------------------------------------------------------------
          SEGMENTED NAVIGATION TABS
          ---------------------------------------------------------------------- */}
      <div className="pos-nav-tabs-wrapper">
        <nav className="pos-nav-tabs">
          {[
            { id: 'cashier', label: 'Mostrador POS', icon: <ShoppingBag size={16} /> },
            { id: 'flow', label: 'Mis trabajos & Agenda', icon: <Sparkles size={16} />, badge: (store.productionOperations || []).filter((operation) => !['done', 'cancelled'].includes(operation.status)).length },
            { id: 'billboard', label: 'Coordinación semanal', icon: <Calendar size={16} /> },
            { id: 'stations', label: 'Estaciones de producción', icon: <Printer size={16} /> },
            { id: 'kanban', label: 'Tablero de órdenes', icon: <Layers size={16} /> },
            { id: 'crm', label: 'Clientes & CRM', icon: <Users size={16} /> },
            { id: 'products', label: 'Productos & Tarifas', icon: <Package size={16} /> },
            { id: 'orders', label: 'Cartera & Pedidos', icon: <FileText size={16} />, badge: store.orders?.length || 0 },
            { id: 'inventory', label: 'Inventario', icon: <Layers size={16} /> },
            { id: 'purchases', label: 'Órdenes de Compra', icon: <Truck size={16} /> },
            { id: 'weekly', label: 'Cuadre Semanal', icon: <Calendar size={16} /> },
            { id: 'expenses', label: 'Caja Chica', icon: <DollarSign size={16} /> },
            { id: 'advisors', label: 'Equipo & Roles', icon: <Users size={16} /> },
          ].filter((item) => canViewTab(item.id)).map((item) => <button key={item.id} type="button" className={`pos-nav-tab ${activeTab === item.id ? 'active' : ''}`} onClick={() => setActiveTab(item.id)}>{item.icon} {item.label}{item.badge !== undefined && <span className="pos-nav-badge">{item.badge}</span>}</button>)}
        </nav>
      </div>

      {/* ----------------------------------------------------------------------
          TAB 1: CASHIER POS
          ---------------------------------------------------------------------- */}
      {activeTab === 'cashier' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          {/* Parked Sales Bar */}
          {store.parkedSales?.length > 0 && (
            <div className="pos-parked-strip">
              <span className="pos-parked-title">
                <PauseCircle size={15} /> Ventas en Espera ({store.parkedSales.length}):
              </span>
              {store.parkedSales.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleRestoreParkedSale(p)}
                  className="pos-parked-pill"
                >
                  <PlayCircle size={13} style={{ color: 'var(--pos-blue)' }} />
                  <span>{p.customerName}</span>
                  <strong style={{ color: 'var(--pos-primary)' }}>${Number(p.totalAmount).toFixed(2)}</strong>
                </button>
              ))}
            </div>
          )}

          {sourceQuoteNumber && (
            <div className="pos-quote-context-banner">
              <FileCheck size={17} />
              <span>Trabajando desde la cotización <strong>{sourceQuoteNumber}</strong>. Al confirmar, se convertirá automáticamente en una orden trazable.</span>
              <button type="button" onClick={() => { setSourceQuoteRequestId(null); setSourceQuoteNumber(''); }}>Quitar vínculo</button>
            </div>
          )}

          <div className="pos-cashier-grid">
            {/* ----------------- LEFT COLUMN: Customer & Product Configurator ----------------- */}
            <div style={{ display: 'grid', gap: '16px' }}>
              {/* Card 1: Customer & Job Information */}
              <div className="pos-card">
                <div className="pos-card-header">
                  <h3 className="pos-card-title">
                    <Users size={17} /> Datos del Cliente & Trabajo
                  </h3>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {selectedCustomerObj?.isVip && (
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#b45309', background: '#fef3c7', padding: '3px 10px', borderRadius: '999px', border: '1px solid #fde68a' }}>
                        ⭐ VIP / Mayorista
                      </span>
                    )}
                    {customerId && (
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--pos-success-dark)', background: 'var(--pos-success-soft)', padding: '3px 10px', borderRadius: '999px', border: '1px solid var(--pos-success-border)' }}>
                        ✓ CRM Vinculado
                      </span>
                    )}
                  </div>
                </div>

                {customerDebt > 0 && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#dc2626' }}>
                      <AlertTriangle size={15} />
                      <span>⚠️ Este cliente mantiene un saldo pendiente de: <strong>${customerDebt.toFixed(2)}</strong></span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('orders')}
                      style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                    >
                      Ver Detalle
                    </button>
                  </div>
                )}

                <div className="pos-responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="pos-label required">Nombre / Razón Social (F1)</label>
                    <div className="pos-input-group">
                      <div className="pos-input-icon-left"><Users size={14} /></div>
                      <input
                        id="pos-customer-search-input"
                        type="text"
                        className="pos-input pos-input-with-icon"
                        value={customerName}
                        onChange={(e) => handleCustomerFieldChange('name', e.target.value)}
                        onFocus={() => setActiveCustomerField('name')}
                        onKeyDown={handleCustomerSearchKeyDown}
                        placeholder="Escribe para buscar cliente o nuevo..."
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="pos-label">RUC / Cédula</label>
                    <div className="pos-input-group">
                      <div className="pos-input-icon-left"><Hash size={14} /></div>
                      <input
                        type="text"
                        className="pos-input pos-input-with-icon"
                        value={customerIdentification}
                        onChange={(e) => handleCustomerFieldChange('identification', e.target.value)}
                        onFocus={() => setActiveCustomerField('identification')}
                        onKeyDown={handleCustomerSearchKeyDown}
                        placeholder="1790012345001"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </div>

                <div className="pos-responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                  <div>
                    <label className="pos-label required">WhatsApp de Contacto</label>
                    <div className="pos-input-group">
                      <div className="pos-input-icon-left"><Phone size={14} /></div>
                      <input
                        type="text"
                        className="pos-input pos-input-with-icon"
                        value={customerPhone}
                        onChange={(e) => handleCustomerFieldChange('phone', e.target.value)}
                        onFocus={() => setActiveCustomerField('phone')}
                        onKeyDown={handleCustomerSearchKeyDown}
                        placeholder="0991234567"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="pos-label">Fecha de Entrega</label>
                    <div className="pos-input-group">
                      <div className="pos-input-icon-left"><Calendar size={14} /></div>
                      <input
                        type="date"
                        className="pos-input pos-input-with-icon"
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {activeCustomerField && customerSuggestions.length > 0 && (
                  <div className="pos-customer-suggestions" role="listbox" aria-label="Clientes coincidentes">
                    <div className="pos-customer-suggestions-heading">
                      <Search size={14} /> Coincidencias del CRM · usa ↑ ↓ y Enter
                    </div>
                    {customerSuggestions.map(({ customer, matchField }, index) => (
                      <button
                        key={customer.id}
                        type="button"
                        role="option"
                        aria-selected={index === customerSuggestionIndex}
                        className={index === customerSuggestionIndex ? 'active' : ''}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setCustomerSuggestionIndex(index)}
                        onClick={() => handleSelectCustomerSuggestion(customer)}
                      >
                        <span className="pos-customer-avatar">{String(customer.name || 'C').slice(0, 2).toUpperCase()}</span>
                        <span className="pos-customer-suggestion-main">
                          <strong>{customer.name} {customer.isVip ? '⭐' : ''}</strong>
                          <small>{customer.identification || 'Sin identificación'} · {customer.phone || 'Sin teléfono'}</small>
                        </span>
                        <span className="pos-customer-match">Coincide: {matchField}</span>
                      </button>
                    ))}
                  </div>
                )}

                {activeCustomerField && activeCustomerQuery && customerSuggestions.length === 0 && (activeCustomerQuery.length >= 2) && (
                  <div className="pos-new-customer-hint">Cliente nuevo: se creará y vinculará al CRM al confirmar la venta.</div>
                )}

                <div style={{ marginTop: '10px' }}>
                  <label className="pos-label">Descripción del Trabajo / Proyecto</label>
                  <div className="pos-input-group">
                    <div className="pos-input-icon-left"><FileText size={14} /></div>
                    <input
                      type="text"
                      className="pos-input pos-input-with-icon"
                      value={jobName}
                      onChange={(e) => setJobName(e.target.value)}
                      placeholder="Ej. Lona Frontlit 3x2m con dobladillo y ojales cada 30cm"
                    />
                  </div>
                </div>

                {/* Workshop Area & On-Site Installation Coordination */}
                <div className="pos-workshop-coordination" style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid var(--line)', display: 'grid', gap: '10px' }}>
                  <div className="pos-responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="pos-label" style={{ fontSize: '11px' }}>Área de Producción Principal</label>
                      <select
                        className="pos-select"
                        value={assignedArea}
                        onChange={(e) => setAssignedArea(e.target.value)}
                        style={{ fontSize: '12px', padding: '6px 8px' }}
                      >
                        <option value="impresion">🖨️ Impresión (Gran Formato & Digital)</option>
                        <option value="sublimacion">👕 Sublimación & DTF Textil</option>
                        <option value="corte_laser">⚡ Corte Láser & CNC Rígidos</option>
                        <option value="acabados">✂️ Acabados & Confección</option>
                      </select>
                    </div>

                    <div>
                      <label className="pos-label" style={{ fontSize: '11px' }}>Fecha Fabricación en Taller</label>
                      <input
                        type="date"
                        className="pos-input"
                        value={executionDate}
                        onChange={(e) => setExecutionDate(e.target.value)}
                        style={{ fontSize: '12px', padding: '6px 8px' }}
                      />
                    </div>
                  </div>

                  <div className="pos-route-selector">
                    <div>
                      <strong>Ruta de producción sugerida</strong>
                      <span>Marca todas las áreas que participarán. Diseño, aprobación, calidad y entrega se agregan automáticamente.</span>
                    </div>
                    <div className="pos-route-options">
                      {PRODUCTION_AREAS.filter((area) => ['impresion', 'corte_laser', 'sublimacion', 'taller'].includes(area.id)).map((area) => (
                        <label key={area.id} className={involvedAreas.includes(area.id) ? 'selected' : ''} style={{ '--area-color': area.color }}>
                          <input
                            type="checkbox"
                            checked={involvedAreas.includes(area.id)}
                            onChange={(event) => setInvolvedAreas((current) => event.target.checked ? [...new Set([...current, area.id])] : current.filter((id) => id !== area.id))}
                          />
                          <span>{area.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="posReqInstCheck"
                      checked={requiresInstallation}
                      onChange={(e) => setRequiresInstallation(e.target.checked)}
                      style={{ width: '17px', height: '17px', accentColor: 'var(--orange)' }}
                    />
                    <label htmlFor="posReqInstCheck" style={{ fontSize: '12px', fontWeight: 800, cursor: 'pointer', color: 'var(--ink)' }}>
                      🚚 Requiere Montaje / Instalación en Sitio
                    </label>
                  </div>

                  {requiresInstallation && (
                    <div className="pos-installation-fields">
                      <div className="pos-responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '10px' }}>
                      <div>
                        <label className="pos-label" style={{ fontSize: '11px' }}>Dirección de Instalación</label>
                        <input
                          type="text"
                          className="pos-input"
                          placeholder="Calle principal, número y referencia..."
                          value={installationAddress}
                          onChange={(e) => setInstallationAddress(e.target.value)}
                          style={{ fontSize: '11.5px', padding: '6px 8px' }}
                        />
                      </div>
                      <div>
                        <label className="pos-label" style={{ fontSize: '11px' }}>Fecha de Montaje</label>
                        <input
                          type="date"
                          className="pos-input"
                          value={installationDate}
                          onChange={(e) => setInstallationDate(e.target.value)}
                          style={{ fontSize: '11.5px', padding: '6px 8px' }}
                        />
                      </div>
                      </div>
                      <div>
                        <label className="pos-label" style={{ fontSize: '11px' }}>Enlace de Google Maps</label>
                        <div className="pos-input-group">
                          <div className="pos-input-icon-left"><MapPin size={14} /></div>
                          <input
                            type="url"
                            className={`pos-input pos-input-with-icon ${installationMapsUrl && !isGoogleMapsUrl(installationMapsUrl) ? 'pos-input-error' : ''}`}
                            placeholder="Pega el enlace compartido desde Google Maps"
                            value={installationMapsUrl}
                            onChange={(event) => setInstallationMapsUrl(event.target.value.trim())}
                          />
                        </div>
                        {installationMapsUrl && !isGoogleMapsUrl(installationMapsUrl) && <small className="pos-field-error">Usa un enlace HTTPS de Google Maps.</small>}
                      </div>
                      {installationMapEmbedUrl && (
                        <div className="pos-installation-map-preview">
                          <iframe title="Vista previa de la ubicación de instalación" src={installationMapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                          <a href={getGoogleMapsOpenUrl(installationMapsUrl, installationAddress)} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir ubicación</a>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Cloud File Uploader for Artwork */}
                <div style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setShowUploader(!showUploader)}
                    className="pos-cat-pill"
                    style={{ padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', background: '#fff' }}
                  >
                    <UploadCloud size={14} />
                    {artUrl ? '✓ Archivo Adjunto (Clic para cambiar)' : '+ Adjuntar Arte / Vector PDF / AI'}
                  </button>

                  {showUploader && (
                    <div style={{ marginTop: '10px' }}>
                      <SupabaseFileUploader
                        onUploadComplete={(url) => {
                          setArtUrl(url);
                          setShowUploader(false);
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Customer Credit Alert Banner */}
                {selectedCustomerObj && (Number(selectedCustomerObj.creditLimit) > 0 || customerDebt > 0) && (
                  <div style={{
                    marginTop: '10px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: customerDebt > (Number(selectedCustomerObj.creditLimit) || 0) && Number(selectedCustomerObj.creditLimit) > 0 ? '#fef2f2' : '#f0fdf4',
                    border: `1.5px solid ${customerDebt > (Number(selectedCustomerObj.creditLimit) || 0) && Number(selectedCustomerObj.creditLimit) > 0 ? '#fca5a5' : '#86efac'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '12px',
                    flexWrap: 'wrap',
                    gap: '6px'
                  }}>
                    <div>
                      <strong>Cupo de Crédito:</strong> ${(Number(selectedCustomerObj.creditLimit) || 0).toFixed(2)} | <strong>Plazo:</strong> {selectedCustomerObj.creditDays || 0} días
                      {selectedCustomerObj.isVip && <span style={{ marginLeft: '8px', color: 'var(--orange)', fontWeight: 900 }}>★ Tarifa VIP</span>}
                    </div>
                    <div style={{ fontWeight: 900, color: customerDebt > 0 ? '#dc2626' : '#166534' }}>
                      {customerDebt > 0 ? `⚠️ Deuda Pendiente: $${customerDebt.toFixed(2)}` : '✓ Cartera al Día'}
                    </div>
                  </div>
                )}
              </div>

              {/* Card 2: Visual Product Matrix & Dynamic Area Calculator */}
              <div className="pos-card">
                <div className="pos-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className="pos-card-title">
                    <Package size={17} /> Catálogo de Sustratos & Calculadora m²
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800 }}>
                    {store.products?.length || 0} materiales disponibles
                  </span>
                </div>

                {quickProducts.length > 0 && (
                  <div className="pos-quick-product-strip" aria-label="Productos frecuentes">
                    <span className="pos-quick-product-label">Frecuentes</span>
                    {quickProducts.map((product) => (
                      <span key={product.id} className="pos-quick-product-wrap">
                        <button type="button" className={`pos-quick-product ${selectedProductId === product.id ? 'active' : ''}`} onClick={() => selectQuickProduct(product)}>
                          <span>{favoriteProductIds.includes(product.id) ? '★' : '↺'}</span>
                          {product.name}
                        </button>
                        <button type="button" className="pos-quick-product-favorite" onClick={() => toggleFavoriteProduct(product.id)} title="Marcar como favorito">{favoriteProductIds.includes(product.id) ? '★' : '☆'}</button>
                      </span>
                    ))}
                  </div>
                )}

                <POSProductQuickMatrix
                  products={store.products || []}
                  selectedProduct={selectedProduct}
                  onSelectProduct={selectQuickProduct}
                  onAddToCart={(item) => {
                    setCartItems((prev) => [
                      ...prev,
                      { ...item, id: `cart-${Date.now()}-${Math.random().toString(36).substring(2, 6)}` }
                    ]);
                  }}
                  customerVipTier={selectedCustomerObj?.isVip ? 'mayorista' : null}
                />
              </div>
            </div>

            {/* ----------------- RIGHT COLUMN: Shopping Cart & Checkout ----------------- */}
            <div style={{ display: 'grid', gap: '16px' }}>
              <div className="pos-card">
                <div className="pos-card-header">
                  <h3 className="pos-card-title">
                    <ShoppingBag size={17} /> Carrito de Venta ({cartItems.length})
                  </h3>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setIsFreeItemModalOpen(true)}
                      className="pos-cat-pill"
                      style={{ padding: '4px 10px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }}
                      title="Agregar servicio especial o producto no catalogado (F4)"
                    >
                      <Plus size={13} /> + Ítem Libre (F4)
                    </button>
                    <button
                      type="button"
                      onClick={handleParkSale}
                      className="pos-cat-pill"
                      style={{ padding: '4px 10px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                      title="Pausar venta para atender a otro cliente (F6)"
                    >
                      <PauseCircle size={13} /> En Espera
                    </button>
                  </div>
                </div>

                {/* Cart Items List */}
                {cartItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--pos-text-subtle)' }}>
                    <ShoppingBag size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>El carrito está vacío</p>
                    <small style={{ fontSize: '11.5px' }}>Selecciona productos en el panel izquierdo para cotizar</small>
                  </div>
                ) : (
                  <div className="pos-cart-list">
                    {cartItems.map((itm, idx) => (
                      <div key={itm.id || idx} className="pos-cart-item">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="pos-cart-item-title">{itm.productName}</div>
                          <div className="pos-cart-item-meta" style={{ flexWrap: 'wrap', gap: '4px' }}>
                            {itm.widthCm ? <span className="pos-cart-item-badge">{itm.widthCm}x{itm.heightCm}cm ({itm.areaM2}m²)</span> : null}
                            <span className="pos-cart-item-badge">Cant: {itm.quantity}</span>
                            {itm.finishing && itm.finishing !== 'none' && itm.finishing !== 'Sin acabados' && itm.finishing !== 'Sin acabados extra' && (
                              <span className="pos-cart-item-badge" style={{ color: 'var(--pos-primary)', fontWeight: 700 }}>
                                ✂️ {itm.finishing} {itm.eyeletCount > 0 ? `(${itm.eyeletCount} ojales)` : ''}
                              </span>
                            )}
                            {itm.designLabel && (
                              <span className="pos-cart-item-badge" style={{ color: '#6366f1', fontWeight: 700, background: '#e0e7ff' }}>
                                🎨 {itm.designLabel}
                              </span>
                            )}
                            {itm.installationLabel && (
                              <span className="pos-cart-item-badge" style={{ color: '#0891b2', fontWeight: 700, background: '#cffafe' }}>
                                🔨 {itm.installationLabel}
                              </span>
                            )}
                            {itm.isOverridden && (
                              <span className="pos-cart-item-badge" style={{ color: '#b45309', fontWeight: 800, background: '#fef3c7' }}>
                                ✏️ Precio Asignado ({itm.priceAdjustment >= 0 ? `+$${itm.priceAdjustment.toFixed(2)}` : `-$${Math.abs(itm.priceAdjustment).toFixed(2)}`})
                              </span>
                            )}
                          </div>
                          {itm.notes && (
                            <div style={{ fontSize: '11px', color: '#0284c7', fontStyle: 'italic', marginTop: '3px' }}>
                              📝 {itm.notes}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ textAlign: 'right' }}>
                            <span className="pos-cart-item-price">${itm.totalPrice.toFixed(2)}</span>
                            {itm.isOverridden && itm.systemPrice && (
                              <div style={{ fontSize: '10px', color: 'var(--muted)', textDecoration: 'line-through' }}>
                                Sist: ${itm.systemPrice.toFixed(2)}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromCart(idx)}
                            className="pos-trash-btn"
                            title="Eliminar ítem"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Financial Liquidation Sheet */}
                <div className="pos-financial-sheet">
                  <div className="pos-fin-row">
                    <span>Subtotal Ítems:</span>
                    <strong>${subtotal.toFixed(2)}</strong>
                  </div>

                  {/* Discount Control */}
                  <div className="pos-fin-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Percent size={13} style={{ color: 'var(--pos-primary)' }} />
                      <span>Descuento:</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        style={{ width: '56px', padding: '3px 6px', fontSize: '12px' }}
                        className="pos-input"
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(e.target.value)}
                      />
                      <span>%</span>
                    </div>
                    {discountAmount > 0 ? (
                      <strong style={{ color: 'var(--pos-danger)' }}>-${discountAmount.toFixed(2)}</strong>
                    ) : (
                      <span>$0.00</span>
                    )}
                  </div>

                  {/* IVA (15%) Toggle Switch */}
                  <div className="pos-fin-row">
                    <label className="pos-toggle-switch">
                      <input
                        type="checkbox"
                        className="pos-toggle-input"
                        checked={applyIVA}
                        onChange={(e) => setApplyIVA(e.target.checked)}
                      />
                      <span className="pos-toggle-track" />
                      <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--pos-text-main)' }}>Aplicar IVA (15%)</span>
                    </label>
                    <strong>${taxAmount.toFixed(2)}</strong>
                  </div>

                  {/* Shipping / Freight Input */}
                  <div className="pos-fin-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Truck size={13} />
                      <span>Envío / Flete:</span>
                    </div>
                    <div style={{ width: '90px' }}>
                      <input
                        type="number"
                        step="0.01"
                        style={{ padding: '3px 8px', fontSize: '12px', textAlign: 'right' }}
                        className="pos-input"
                        placeholder="0.00"
                        value={shippingCost}
                        onChange={(e) => setShippingCost(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Grand Total */}
                  <div className="pos-grand-total-row">
                    <span className="pos-grand-total-label">TOTAL VENTA:</span>
                    <span className="pos-grand-total-val">${totalAmount.toFixed(2)}</span>
                  </div>
                </div>

                {/* Multi-Tender Payment Methods */}
                <div style={{ display: 'grid', gap: '10px' }}>
                  <label className="pos-label">Forma de Cobro / Abono</label>
                  {payments.map((p, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px' }}>
                      <select
                        className="pos-select"
                        value={p.method}
                        onChange={(e) => {
                          const updated = [...payments];
                          updated[idx].method = e.target.value;
                          setPayments(updated);
                        }}
                      >
                        <option value="cash">💵 Efectivo</option>
                        <option value="transfer">🏦 Transferencia</option>
                        <option value="card">💳 Tarjeta</option>
                        <option value="check">📜 Cheque</option>
                      </select>
                      <div className="pos-input-group">
                        <input
                          type="number"
                          step="0.01"
                          className="pos-input"
                          placeholder="Monto ($)"
                          value={p.amount}
                          onChange={(e) => {
                            const updated = [...payments];
                            updated[idx].amount = e.target.value;
                            updated[idx].tenderedAmount = e.target.value;
                            updated[idx].changeGiven = 0;
                            setPayments(updated);
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  {/* Quick Cash Buttons */}
                  <div className="pos-quick-cash-row">
                    <span style={{ fontSize: '11px', color: 'var(--pos-text-subtle)', fontWeight: 800, alignSelf: 'center' }}>Cobro Rápido:</span>
                    <button type="button" className="pos-quick-cash-btn" onClick={() => handleQuickCash(totalAmount)}>
                      Exacto (${totalAmount.toFixed(2)})
                    </button>
                    <button type="button" className="pos-quick-cash-btn" onClick={() => handleQuickCash(10)}>$10</button>
                    <button type="button" className="pos-quick-cash-btn" onClick={() => handleQuickCash(20)}>$20</button>
                    <button type="button" className="pos-quick-cash-btn" onClick={() => handleQuickCash(50)}>$50</button>
                    <button type="button" className="pos-quick-cash-btn" onClick={() => handleQuickCash(100)}>$100</button>
                  </div>

                  {/* Balance / Change Status Banner */}
                  <div className={`pos-balance-card ${balanceDue === 0 ? 'paid' : 'has-balance'}`}>
                    <span>Abono: ${totalDeposited.toFixed(2)}</span>
                    <span>
                      {balanceDue > 0 ? `Saldo por cobrar: $${balanceDue.toFixed(2)}` : (changeDue > 0 ? `Vuelto: $${changeDue.toFixed(2)}` : '✓ Pagado Completo')}
                    </span>
                  </div>
                </div>

                {/* Main Submit Action Button */}
                <button
                  type="button"
                  className="pos-checkout-btn"
                  onClick={handleSubmitOrder}
                  disabled={cartItems.length === 0 || isSubmittingOrder || !activeShift}
                >
                  <CheckCircle2 size={19} /> {isSubmittingOrder ? 'Registrando…' : (!activeShift ? 'Abre turno para vender' : 'Registrar Venta & Generar Comprobante')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------
          TAB: WORKSHOP DISPATCHER BILLBOARD (CARTELERA SEMANAL)
          ---------------------------------------------------------------------- */}
      {activeTab === 'billboard' && (
        <POSWorkshopMasterBillboard
          store={store}
          setStore={setStore}
          session={session}
          onOpenWorkOrder={(order) => {
            const items = (store.orderItems || []).filter((i) => i.orderId === order.id);
            const adv = (store.advisors || []).find((a) => a.id === order.advisorId);
            setWorkOrderData({ order, items, advisor: adv });
          }}
          onOpenArtProof={(order) => setArtProofOrder(order)}
        />
      )}

      {activeTab === 'flow' && (
        <POSProductionControl store={store} setStore={setStore} session={session} />
      )}

      {/* ----------------------------------------------------------------------
          TAB: WORKSHOP STATIONS (IMPRESION, SUBLIMACION, CORTE LASER)
          ---------------------------------------------------------------------- */}
      {activeTab === 'stations' && (
        <POSStationWorkspaces
          store={store}
          setStore={setStore}
          session={session}
          activeStation={activeStationArea}
          onStationChange={(st) => setActiveStationArea(st)}
          onOpenWorkOrder={(order) => {
            const items = (store.orderItems || []).filter((i) => i.orderId === order.id);
            const adv = (store.advisors || []).find((a) => a.id === order.advisorId);
            setWorkOrderData({ order, items, advisor: adv });
          }}
        />
      )}

      {/* ----------------------------------------------------------------------
          TAB 2: PRODUCTION KANBAN
          ---------------------------------------------------------------------- */}
      {activeTab === 'kanban' && (
        <POSProductionKanban
          store={store}
          advisorId={currentAdvisorId}
          onStoreUpdate={(updated) => setStore(updated)}
          onOpenWorkOrder={(order) => {
            const items = (store.orderItems || []).filter((i) => i.orderId === order.id);
            const adv = (store.advisors || []).find((a) => a.id === order.advisorId);
            setWorkOrderData({ order, items, advisor: adv });
          }}
          onOpenArtProof={(order) => setArtProofOrder(order)}
        />
      )}

      {/* ----------------------------------------------------------------------
          TAB 3: CUSTOMER CRM 360
          ---------------------------------------------------------------------- */}
      {activeTab === 'crm' && (
        <POSCustomerCRM
          store={store}
          onStoreUpdate={(updated) => setStore(updated)}
          onReorder={handleReorderFromCRM}
        />
      )}

      {/* ----------------------------------------------------------------------
          TAB 4: PRODUCTS & TARIFFS SPREADSHEET MANAGER
          ---------------------------------------------------------------------- */}
      {activeTab === 'products' && (
        <POSProductManager
          store={store}
          onStoreUpdate={(updated) => setStore(updated)}
          session={session}
        />
      )}

      {/* ----------------------------------------------------------------------
          TAB 5: CARTERA & PEDIDOS HISTORICOS
          ---------------------------------------------------------------------- */}
      {activeTab === 'orders' && (
        <div className="pos-card">
          <div className="pos-card-header">
            <h2 className="pos-card-title" style={{ fontSize: '17px' }}>
              <FileText size={19} />
              Cartera de Pedidos & Órdenes ({filteredOrdersList.length})
            </h2>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {/* Search Bar */}
              <div className="pos-input-group" style={{ width: '220px' }}>
                <div className="pos-input-icon-left"><Search size={14} /></div>
                <input
                  type="text"
                  className="pos-input pos-input-with-icon"
                  placeholder="Buscar orden o cliente..."
                  value={orderSearchTerm}
                  onChange={(e) => setOrderSearchTerm(e.target.value)}
                />
              </div>

              {/* Payment Filter */}
              <select
                className="pos-select"
                style={{ width: '150px' }}
                value={orderPaymentFilter}
                onChange={(e) => setOrderPaymentFilter(e.target.value)}
              >
                <option value="all">Todos los Pagos</option>
                <option value="paid">Pagados</option>
                <option value="partial">Con Saldo / Abono</option>
                <option value="pending">Pendientes</option>
              </select>

              {/* Stage Filter */}
              <select
                className="pos-select"
                style={{ width: '160px' }}
                value={orderStageFilter}
                onChange={(e) => setOrderStageFilter(e.target.value)}
              >
                <option value="all">Todas las Etapas</option>
                <option value="preprensa">Pre-prensa</option>
                <option value="aprobacion_arte">Aprobación Arte</option>
                <option value="impresion">En Impresión</option>
                <option value="acabados">Acabados</option>
                <option value="listo">Listo para Retiro</option>
                <option value="entregado">Entregado</option>
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="pos-orders-table">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Trabajo</th>
                  <th>Etapa Taller</th>
                  <th>Total</th>
                  <th>Abono</th>
                  <th>Saldo</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrdersList.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--pos-text-subtle)' }}>
                      No se encontraron pedidos con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredOrdersList.map((ord) => {
                    const items = (store.orderItems || []).filter((i) => i.orderId === ord.id);
                    const adv = (store.advisors || []).find((a) => a.id === ord.advisorId);
                    const cust = (store.customers || []).find((c) => c.id === ord.customerId || c.name === ord.customerName);
                    const isOverdue = ord.deliveryDate && ord.deliveryDate < toISODate() && ord.productionStage !== 'entregado';

                    return (
                      <tr key={ord.id} style={{ background: isOverdue ? 'rgba(239, 68, 68, 0.04)' : 'transparent' }}>
                        <td><strong style={{ color: 'var(--pos-primary)' }}>#{ord.orderNumber}</strong></td>
                        <td style={{ fontSize: '12px', color: 'var(--pos-text-muted)' }}>{ord.orderDate}</td>
                        <td><strong>{ord.customerName}</strong></td>
                        <td>{ord.jobName}</td>
                        <td>
                          <span className={`pos-status-badge ${ord.productionStage || 'preprensa'}`}>
                            {ord.productionStage}
                          </span>
                        </td>
                        <td><b>${Number(ord.totalAmount).toFixed(2)}</b></td>
                        <td style={{ color: 'var(--pos-success)', fontWeight: 700 }}>${Number(ord.depositAmount).toFixed(2)}</td>
                        <td>
                          <strong style={{ color: ord.balanceDue > 0 ? 'var(--pos-danger)' : 'var(--pos-success)' }}>
                            ${Number(ord.balanceDue).toFixed(2)}
                          </strong>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                            {/* SRI Electronic Invoice Button */}
                            <button
                              type="button"
                              className="pos-cat-pill"
                              style={{ padding: '4px 8px', fontSize: '11px', background: 'var(--pos-success-soft)', color: 'var(--pos-success-dark)', border: '1px solid var(--pos-success-border)' }}
                              onClick={() => setSriOrder({ order: ord, items, customer: cust, advisor: adv })}
                              title="Emitir / Ver Factura Electrónica SRI"
                            >
                              <ShieldCheck size={13} /> SRI
                            </button>

                            {ord.balanceDue > 0 && (
                              <button
                                type="button"
                                className="pos-cat-pill"
                                style={{ padding: '4px 8px', fontSize: '11px', background: 'var(--pos-warning-soft)', color: 'var(--pos-warning-dark)', border: '1px solid var(--pos-warning-border)' }}
                                onClick={() => setCollectionOrder(ord)}
                                title="Cobrar saldo pendiente"
                              >
                                <DollarSign size={12} /> Cobrar
                              </button>
                            )}

                            <button
                              type="button"
                              className="pos-cat-pill"
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                              onClick={() => setReceiptOrder(ord)}
                              title="Reimprimir Comprobante Térmico"
                            >
                              <Printer size={13} />
                            </button>

                            <button
                              type="button"
                              className="pos-cat-pill"
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                              onClick={() => setWorkOrderData({ order: ord, items, advisor: adv })}
                              title="Hoja de Taller para Operarios"
                            >
                              <Wrench size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------
          TAB 6: INVENTORY
          ---------------------------------------------------------------------- */}
      {activeTab === 'inventory' && (
        <POSInventoryMaterials
          store={store}
          onStoreUpdate={(updated) => setStore(updated)}
        />
      )}

      {/* ----------------------------------------------------------------------
          TAB 7: PURCHASES TO SUPPLIERS
          ---------------------------------------------------------------------- */}
      {activeTab === 'purchases' && (
        <POSPurchaseOrdersManager
          store={store}
          onStoreUpdate={(updated) => setStore(updated)}
        />
      )}

      {/* ----------------------------------------------------------------------
          TAB 8: WEEKLY CASH RECONCILIATION
          ---------------------------------------------------------------------- */}
      {activeTab === 'weekly' && (
        <div className="pos-card">
          <div className="pos-card-header">
            <h2 className="pos-card-title" style={{ fontSize: '17px' }}>
              <Calendar size={19} />
              Cuadre Semanal de Caja (Formato Excel Lunes a Sábado)
            </h2>
          </div>
          {(() => {
            const balance = calculateWeeklyBalance(store, getMondayOfWeek(), currentAdvisorId);
            return (
              <div style={{ overflowX: 'auto' }}>
                <table className="pos-daily-excel-table">
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th>Fecha</th>
                      <th>Trabajos</th>
                      <th>Venta Bruta</th>
                      <th>Cobrado</th>
                      <th>Por Cobrar</th>
                      <th>Gastos</th>
                      <th>Efectivo</th>
                      <th>Transferencias</th>
                      <th>Neto Caja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balance.days.map((d) => (
                      <tr key={d.date}>
                        <td><strong style={{ textTransform: 'capitalize' }}>{d.dayName}</strong></td>
                        <td style={{ fontSize: '12px', color: 'var(--pos-text-muted)' }}>{d.date}</td>
                        <td>{d.orderCount}</td>
                        <td><b>${d.totalSales.toFixed(2)}</b></td>
                        <td style={{ color: 'var(--pos-success)', fontWeight: 700 }}>${d.totalDeposits.toFixed(2)}</td>
                        <td style={{ color: d.totalBalanceDue > 0 ? 'var(--pos-danger)' : 'var(--pos-text-muted)' }}>${d.totalBalanceDue.toFixed(2)}</td>
                        <td style={{ color: 'var(--pos-warning-dark)' }}>${d.totalExpenses.toFixed(2)}</td>
                        <td>${d.cashAmount.toFixed(2)}</td>
                        <td>${d.transferAmount.toFixed(2)}</td>
                        <td><strong style={{ color: 'var(--pos-blue-dark)' }}>${d.netTotal.toFixed(2)}</strong></td>
                      </tr>
                    ))}
                    <tr style={{ background: 'var(--pos-primary-soft)', fontWeight: 900, borderTop: '2px solid var(--pos-primary)' }}>
                      <td colSpan={2} style={{ color: 'var(--pos-primary)' }}>TOTALES SEMANALES:</td>
                      <td>{balance.totals.orderCount}</td>
                      <td>${balance.totals.totalSales.toFixed(2)}</td>
                      <td style={{ color: 'var(--pos-success)' }}>${balance.totals.totalDeposits.toFixed(2)}</td>
                      <td style={{ color: 'var(--pos-danger)' }}>${balance.totals.totalBalanceDue.toFixed(2)}</td>
                      <td style={{ color: 'var(--pos-warning-dark)' }}>${balance.totals.totalExpenses.toFixed(2)}</td>
                      <td>${balance.totals.cashAmount.toFixed(2)}</td>
                      <td>${balance.totals.transferAmount.toFixed(2)}</td>
                      <td style={{ color: 'var(--pos-primary)', fontSize: '16px' }}>${balance.totals.netTotal.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* ----------------------------------------------------------------------
          TAB 9: PETTY CASH EXPENSES
          ---------------------------------------------------------------------- */}
      {activeTab === 'expenses' && (
        <div className="pos-card">
          <div className="pos-card-header">
            <h2 className="pos-card-title" style={{ fontSize: '17px' }}>
              <DollarSign size={19} />
              Registro de Gastos de Caja Chica
            </h2>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const desc = e.target.description.value;
              const amt = e.target.amount.value;
              const cat = e.target.category.value;
              if (!desc || !amt) return;
              const res = createPOSExpense(store, {
                advisorId: currentAdvisorId,
                description: desc,
                amount: amt,
                category: cat
              });
              if (res.ok) {
                setStore(res.updatedStore);
                e.target.reset();
              }
            }}
            style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}
          >
            <div>
              <label className="pos-label required">Descripción del Gasto</label>
              <input name="description" className="pos-input" placeholder="Ej. Cinta de embalaje, almuerzo taller" required />
            </div>
            <div>
              <label className="pos-label required">Monto ($)</label>
              <input name="amount" type="number" step="0.01" className="pos-input" placeholder="0.00" required />
            </div>
            <div>
              <label className="pos-label">Categoría</label>
              <select name="category" className="pos-select">
                <option value="Suministros">Suministros Taller</option>
                <option value="Alimentación">Alimentación</option>
                <option value="Transporte">Transporte / Flete</option>
                <option value="Servicios">Servicios / Varios</option>
              </select>
            </div>
            <button type="submit" className="pos-add-cart-btn" style={{ padding: '10px 18px' }}>
              + Registrar Gasto
            </button>
          </form>

          <table className="pos-orders-table" style={{ marginTop: '14px' }}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Categoría</th>
                <th>Monto</th>
                <th style={{ textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {(store.expenses || []).length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--pos-text-subtle)' }}>No hay gastos registrados en caja chica</td></tr>
              ) : (
                (store.expenses || []).map((exp) => (
                  <tr key={exp.id}>
                    <td>{exp.expenseDate}</td>
                    <td><strong>{exp.description}</strong></td>
                    <td><span className="pos-nav-badge">{exp.category}</span></td>
                    <td style={{ color: 'var(--pos-warning-dark)', fontWeight: 800 }}>${Number(exp.amount).toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const res = deletePOSExpense(store, exp.id);
                          if (res.ok) setStore(res.updatedStore);
                        }}
                        className="pos-trash-btn"
                        title="Eliminar gasto"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ----------------------------------------------------------------------
          TAB 10: ADVISORS & CREDENTIALS MANAGEMENT
          ---------------------------------------------------------------------- */}
      {activeTab === 'advisors' && (
        <POSAdvisorsManagement store={store} setStore={setStore} />
      )}

      {/* ----------------------------------------------------------------------
          MODALS & OVERLAYS
          ---------------------------------------------------------------------- */}
      {receiptOrder && (
        <POSReceiptModal
          order={receiptOrder}
          items={(store.orderItems || []).filter((i) => i.orderId === receiptOrder.id)}
          advisor={(store.advisors || []).find((a) => a.id === receiptOrder.advisorId)}
          isOpen={Boolean(receiptOrder)}
          onClose={() => setReceiptOrder(null)}
        />
      )}

      {workOrderData && (
        <POSWorkOrderModal
          order={workOrderData.order}
          items={workOrderData.items}
          advisor={workOrderData.advisor}
          isOpen={Boolean(workOrderData)}
          onClose={() => setWorkOrderData(null)}
        />
      )}

      {artProofOrder && (
        <POSArtProofModal
          order={artProofOrder}
          isOpen={Boolean(artProofOrder)}
          onClose={() => setArtProofOrder(null)}
          onSave={(updated) => setStore(updated)}
        />
      )}

      {collectionOrder && (
        <POSPaymentCollectionModal
          order={collectionOrder}
          store={store}
          advisorId={currentAdvisorId}
          onClose={() => setCollectionOrder(null)}
          onSuccess={(updatedStore, updatedOrder) => {
            setStore(updatedStore);
            setReceiptOrder(updatedOrder);
          }}
        />
      )}

      {sriOrder && (
        <POSSRIInvoiceModal
          order={sriOrder.order}
          items={sriOrder.items}
          customer={sriOrder.customer}
          advisor={sriOrder.advisor}
          isOpen={Boolean(sriOrder)}
          onClose={() => setSriOrder(null)}
        />
      )}

      {/* SHIFT OPEN/CLOSE MODAL */}
      {roleCapabilities.canOpenCash && isShiftModalOpen && (
        <div className="pos-modal-overlay">
          <div className="pos-modal-card" style={{ maxWidth: '440px' }}>
            <h2 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 900 }}>
              {shiftAction === 'open' ? 'Apertura de Turno de Caja' : 'Cierre de Turno & Arqueo'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (shiftAction === 'open') {
                  const res = openCashShift(store, currentAdvisorId, shiftCashAmount, shiftNotes);
                  if (res.ok) setStore(res.updatedStore);
                  else toast.error(res.error);
                } else {
                  if (!activeShift) return;
                  const res = closeCashShift(store, activeShift.id, shiftCashAmount, shiftNotes);
                  if (res.ok) setStore(res.updatedStore);
                }
                setIsShiftModalOpen(false);
                setShiftCashAmount('');
                setShiftNotes('');
              }}
              style={{ display: 'grid', gap: '14px' }}
            >
              <div>
                <label className="pos-label required">
                  {shiftAction === 'open' ? 'Efectivo Inicial en Caja ($)' : 'Efectivo Físico Contado ($)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="pos-input"
                  value={shiftCashAmount}
                  onChange={(e) => setShiftCashAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="pos-label">Observaciones / Billetes</label>
                <input
                  type="text"
                  className="pos-input"
                  value={shiftNotes}
                  onChange={(e) => setShiftNotes(e.target.value)}
                  placeholder="Ej. Billetes de $20 y sueltos"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="pos-cat-pill" onClick={() => setIsShiftModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="pos-add-cart-btn" style={{ width: 'auto', padding: '10px 18px' }}>
                  {shiftAction === 'open' ? 'Abrir Turno' : 'Cerrar y Cuadrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Miscellaneous / Freeform Custom Item Modal (F4) */}
      {isFreeItemModalOpen && (
        <div className="pos-modal-overlay">
          <div className="pos-modal-card" style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={20} color="var(--orange)" /> + Ítem Libre / Servicio Especial
              </h2>
              <button type="button" onClick={() => setIsFreeItemModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Minus size={20} />
              </button>
            </div>

            <form onSubmit={handleAddFreeItem} style={{ display: 'grid', gap: '14px' }}>
              <div>
                <label className="pos-label required">Concepto / Nombre del Servicio o Producto</label>
                <input
                  type="text"
                  className="pos-input"
                  value={freeItemName}
                  onChange={(e) => setFreeItemName(e.target.value)}
                  placeholder="Ej. Instalación de rótulo en sitio / Retiro de estructura vieja"
                  required
                  autoFocus
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                <div>
                  <label className="pos-label required">Precio Unitario ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="pos-input"
                    value={freeItemPrice}
                    onChange={(e) => setFreeItemPrice(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="pos-label required">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="pos-input"
                    value={freeItemQty}
                    onChange={(e) => setFreeItemQty(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="pos-label">Categoría / Familia</label>
                <select
                  className="pos-select"
                  value={freeItemCategory}
                  onChange={(e) => setFreeItemCategory(e.target.value)}
                >
                  <option value="Servicios Especiales">🔧 Servicios Especiales / Instalación</option>
                  <option value="Diseño Gráfico">🎨 Diseño Gráfico & Diagramación</option>
                  <option value="Estructuras Metálicas">🏗️ Estructuras & Cajas Metálicas</option>
                  <option value="Transporte y Flete">🚚 Transporte & Flete Foráneo</option>
                  <option value="Varios">📦 Varios / Misceláneos</option>
                </select>
              </div>

              <div>
                <label className="pos-label">Notas Técnicas para Taller</label>
                <textarea
                  className="pos-textarea"
                  rows={2}
                  value={freeItemNotes}
                  onChange={(e) => setFreeItemNotes(e.target.value)}
                  placeholder="Detalles específicos para la orden de trabajo..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button type="button" className="pos-cat-pill" onClick={() => setIsFreeItemModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="pos-add-cart-btn" style={{ width: 'auto', padding: '10px 20px' }}>
                  <Plus size={16} /> Agregar al Carrito (↵)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Cheat-Sheet Modal */}
      {showShortcutsModal && (
        <POSKeyboardShortcutsModal
          isOpen={showShortcutsModal}
          onClose={() => setShowShortcutsModal(false)}
        />
      )}
    </div>
  );
}
