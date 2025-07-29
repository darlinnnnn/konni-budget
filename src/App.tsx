import React, { useState, useEffect, useRef, useCallback } from 'react';
// Mengimpor createClient langsung dari CDN untuk mengatasi masalah resolusi modul
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// --- Konfigurasi Klien Supabase ---
const supabaseUrl = "https://mldritximqqrappmcsvb.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sZHJpdHhpbXFxcmFwcG1jc3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NDgyMDUsImV4cCI6MjA2NjQyNDIwNX0.0C3UVhSscx5iUC5_EkCZ9NtmZzRObawQLfhgV-eOmHo";

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Kesalahan: URL Supabase atau Kunci Anon belum diatur.");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Tipe Data ---
interface Transaction {
  id: number;
  tanggal: string;
  nominal_transaksi: string;
  deskripsi: string | null;
  categories: { id: number; name: string } | null; // Kategori bisa jadi null
}
interface Category {
  id: number;
  name: string;
}

// --- Fungsi Helper ---
const parseNominal = (nominalStr: string): number => {
  if (!nominalStr) return 0;
  const numberString = nominalStr.replace(/Rp|\./g, '').replace(',', '.');
  return parseFloat(numberString);
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
};

const getYearMonthString = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
}

const ITEMS_PER_PAGE = 10;

// --- Komponen Utama ---
function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [totalNominal, setTotalNominal] = useState<number>(0);
  
  const [budget, setBudget] = useState<number>(0);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isBudgetModalVisible, setIsBudgetModalVisible] = useState(false);
  const [budgetInput, setBudgetInput] = useState<string>("");

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentMonth.getFullYear());
  const pickerRef = useRef<HTMLDivElement>(null);

  const [theme, setTheme] = useState('dark');
  const [notificationPermission, setNotificationPermission] = useState(Notification.permission);
  
  const [isNotificationBlockedModalOpen, setIsNotificationBlockedModalOpen] = useState(false);
  const [isNotificationBlockedModalVisible, setIsNotificationBlockedModalVisible] = useState(false);

  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isTransactionModalVisible, setIsTransactionModalVisible] = useState(false);
  const [newTransactionNominal, setNewTransactionNominal] = useState('');
  const [newTransactionDesc, setNewTransactionDesc] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const observer = useRef<IntersectionObserver>();

  const lastTransactionElementRef = useCallback(node => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore]);

  const openModal = (setter: React.Dispatch<React.SetStateAction<boolean>>) => setter(true);
  
  const createModalCloseHandler = (
    setVisibility: React.Dispatch<React.SetStateAction<boolean>>,
    setOpen: React.Dispatch<React.SetStateAction<boolean>>,
    cleanup?: () => void
  ) => () => {
    setVisibility(false);
    setTimeout(() => {
        setOpen(false);
        if (cleanup) cleanup();
    }, 300);
  };

  const cleanupTransactionModal = () => {
      setEditingTransaction(null);
      setNewTransactionNominal('');
      setNewTransactionDesc('');
      setSelectedCategoryId('');
  };

  const closeTransactionModal = createModalCloseHandler(setIsTransactionModalVisible, setIsTransactionModalOpen, cleanupTransactionModal);
  const closeBudgetModal = createModalCloseHandler(setIsBudgetModalVisible, setIsBudgetModalOpen);
  const closeNotificationBlockedModal = createModalCloseHandler(setIsNotificationBlockedModalVisible, setIsNotificationBlockedModalOpen);
  const closeCategoryModal = createModalCloseHandler(setIsCategoryModalVisible, setIsCategoryModalOpen);

  useEffect(() => { if (isTransactionModalOpen) setTimeout(() => setIsTransactionModalVisible(true), 10) }, [isTransactionModalOpen]);
  useEffect(() => { if (isBudgetModalOpen) setTimeout(() => setIsBudgetModalVisible(true), 10) }, [isBudgetModalOpen]);
  useEffect(() => { if (isNotificationBlockedModalOpen) setTimeout(() => setIsNotificationBlockedModalVisible(true), 10) }, [isNotificationBlockedModalOpen]);
  useEffect(() => { if (isCategoryModalOpen) setTimeout(() => setIsCategoryModalVisible(true), 10) }, [isCategoryModalOpen]);

  const requestNotificationPermission = async () => {
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  const showNewTransactionNotification = (transaction: any) => {
    if (notificationPermission !== 'granted') return;
    const nominal = transaction.nominal_transaksi || '0';
    const bodyText = `Transaksi baru sebesar ${nominal} telah ditambahkan.`;
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification('Transaksi Baru!', { body: bodyText, icon: '/logo_192x192.png', vibrate: [200, 100, 200] });
    });
  };

  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark') }, [theme]);
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const goToPreviousMonth = () => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const goToNextMonth = () => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  const handleMonthSelect = (monthIndex: number) => {
    setCurrentMonth(new Date(pickerYear, monthIndex, 1));
    setIsPickerOpen(false);
  };

  const handleInputChangeWithFormatting = (value: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    const numericValue = value.replace(/[^0-9]/g, '');
    setter(numericValue === "" ? "" : new Intl.NumberFormat('id-ID').format(parseInt(numericValue, 10)));
  };

  const handleSaveBudget = async () => {
    const amount = parseFloat(budgetInput.replace(/\./g, ''));
    if (isNaN(amount) || amount < 0) return;
    const yearMonth = getYearMonthString(currentMonth);
    const { error } = await supabase.from('budgets').upsert({ year_month: yearMonth, amount: amount }, { onConflict: 'year_month' });
    if (error) alert("Gagal menyimpan budget: " + error.message);
    else {
      setBudget(amount);
      closeBudgetModal();
      setBudgetInput("");
    }
  };

  const handleOpenEditModal = (trx: Transaction) => {
    setEditingTransaction(trx);
    const formattedNominal = trx.nominal_transaksi.replace(/Rp|,00/g, '');
    setNewTransactionNominal(formattedNominal);
    setSelectedCategoryId(trx.categories ? trx.categories.id.toString() : '');
    setNewTransactionDesc(trx.deskripsi || '');
    openModal(setIsTransactionModalOpen);
  };

  const handleSaveTransaction = async () => {
    if (!selectedCategoryId) {
        alert("Kategori wajib diisi.");
        return;
    }

    let error;

    if (editingTransaction) {
        // HANYA UPDATE KATEGORI UNTUK TRANSAKSI YANG ADA
        const { error: updateError } = await supabase
            .from('tes')
            .update({ category_id: parseInt(selectedCategoryId) })
            .eq('id', editingTransaction.id);
        error = updateError;
    } else {
        // BUAT TRANSAKSI BARU
        if (!newTransactionNominal) {
            alert("Nominal wajib diisi.");
            return;
        }
        const nominalValue = parseFloat(newTransactionNominal.replace(/\./g, ''));
        const nominalForDb = `Rp${new Intl.NumberFormat('id-ID').format(nominalValue)},00`;
        const newRecord = { 
            tanggal: new Date().toISOString(), 
            nominal_transaksi: nominalForDb, 
            deskripsi: newTransactionDesc, 
            category_id: parseInt(selectedCategoryId) 
        };
        const { error: insertError } = await supabase.from('tes').insert([newRecord]);
        error = insertError;
    }

    if (error) alert("Gagal menyimpan transaksi: " + error.message);
    else closeTransactionModal();
  };
  
  const handleAddCategory = async () => {
      if (!newCategoryName) return;
      const { error } = await supabase.from('categories').insert([{ name: newCategoryName }]).select();
      if (error) alert("Gagal menambah kategori: " + error.message);
      else setNewCategoryName("");
  };
  
  const handleDeleteCategory = async (id: number) => {
      if (!confirm("Yakin ingin menghapus kategori ini? Semua transaksi terkait akan kehilangan kategorinya.")) return;
      const { error: updateError } = await supabase.from('tes').update({ category_id: null }).eq('category_id', id);
      if (updateError) {
          alert("Gagal memperbarui transaksi terkait: " + updateError.message);
          return;
      }
      const { error: deleteError } = await supabase.from('categories').delete().eq('id', id);
      if (deleteError) alert("Gagal menghapus kategori: " + deleteError.message);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setIsPickerOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerRef]);

  useEffect(() => { setTransactions([]); setPage(0); setHasMore(true); }, [currentMonth]);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!hasMore) return;
      const loader = page === 0 ? setLoading : setLoadingMore;
      loader(true);
      setError(null);
      try {
        const startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59, 999);
        const from = page * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;
        const { data, error: dbError } = await supabase
          .from('tes')
          .select('*, categories(id, name)')
          .gte('tanggal', startDate.toISOString())
          .lte('tanggal', endDate.toISOString())
          .order('tanggal', { ascending: false })
          .range(from, to);
        if (dbError) throw dbError;
        if (data) {
          setTransactions(prev => [...prev, ...data as any]);
          setHasMore(data.length === ITEMS_PER_PAGE);
        }
      } catch (err: any) {
        setError(`Gagal mengambil data: ${err.message}`);
      } finally {
        loader(false);
      }
    };
    fetchTransactions();
  }, [page, currentMonth, hasMore]);
  
  useEffect(() => {
      const fetchBudgetAndTotal = async () => {
          try {
            const yearMonth = getYearMonthString(currentMonth);
            const startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            const endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59, 999);
            const { data: budgetData } = await supabase.from('budgets').select('amount').eq('year_month', yearMonth).single();
            const { data: allTransactions } = await supabase.from('tes').select('nominal_transaksi').gte('tanggal', startDate.toISOString()).lte('tanggal', endDate.toISOString());
            const total = (allTransactions || []).reduce((sum, trx) => sum + parseNominal(trx.nominal_transaksi), 0);
            setTotalNominal(total);
            setBudget(budgetData?.amount || 0);
          } catch (err: any) { console.error("Gagal mengambil budget/total:", err); }
      };
      fetchBudgetAndTotal();
  }, [currentMonth, transactions]);

  useEffect(() => {
    const fetchCategories = async () => {
        const { data } = await supabase.from('categories').select('*').order('name', { ascending: true });
        setCategories(data || []);
    };
    fetchCategories();

    const channel = supabase
      .channel('realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tes' }, (payload) => {
          if (payload.eventType === 'INSERT') showNewTransactionNotification(payload.new);
          setTransactions([]); setPage(0); setHasMore(true);
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets' }, () => {
          const yearMonth = getYearMonthString(currentMonth);
          supabase.from('budgets').select('amount').eq('year_month', yearMonth).single().then(({data}) => setBudget(data?.amount || 0));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => fetchCategories())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentMonth, notificationPermission]);

  const formatTanggal = (dateString: string) => new Date(dateString).toLocaleString('id-ID', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const sisaBudget = budget - totalNominal;
  const budgetProgress = budget > 0 ? (totalNominal / budget) * 100 : 0;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-100 p-4 sm:p-6 lg:p-8 transition-colors duration-300">
      <div className="max-w-4xl mx-auto pb-24">
        <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Ringkasan Keuangan</h1>
            <div className="flex items-center gap-2">
                <button onClick={() => openModal(setIsCategoryModalOpen)} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-150 active:scale-95" title="Kelola Kategori"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A2 2 0 013 8V5a2 2 0 012-2z" /></svg></button>
                {notificationPermission === 'default' && (<button onClick={requestNotificationPermission} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-150 active:scale-95" title="Izinkan Notifikasi"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg></button>)}
                {notificationPermission === 'denied' && (<button onClick={() => openModal(setIsNotificationBlockedModalOpen)} className="p-2 rounded-full text-rose-500 dark:text-rose-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-150 active:scale-95" title="Notifikasi diblokir. Klik untuk bantuan."><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg></button>)}
                <button onClick={toggleTheme} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-150 active:scale-95">{theme === 'dark' ? (<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>) : (<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>)}</button>
            </div>
        </div>
        
        <div className="relative z-10 mb-6 p-4 bg-white dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-2xl shadow-lg dark:shadow-black/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                <button onClick={goToPreviousMonth} className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-transform duration-150 active:scale-95"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg></button>
                <button onClick={() => setIsPickerOpen(!isPickerOpen)} className="text-lg font-semibold w-36 text-center tabular-nums p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-transform duration-150 active:scale-95">{new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(currentMonth)}</button>
                {isPickerOpen && (<div ref={pickerRef} className="absolute top-full mt-2 w-64 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl p-4 z-20"><div className="flex justify-between items-center mb-4"><button onClick={() => setPickerYear(y => y - 1)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-transform duration-150 active:scale-95">&lt;</button><span className="font-bold text-lg">{pickerYear}</span><button onClick={() => setPickerYear(y => y + 1)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-transform duration-150 active:scale-95">&gt;</button></div><div className="grid grid-cols-4 gap-2">{months.map((month, index) => (<button key={month} onClick={() => handleMonthSelect(index)} className="p-2 text-center rounded-md hover:bg-theme-gold hover:text-white transition-all duration-150 active:scale-95">{month}</button>))}</div></div>)}
                <button onClick={goToNextMonth} className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-transform duration-150 active:scale-95"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg></button>
            </div>
        </div>

        <div className="mb-6 p-6 bg-white dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-2xl shadow-lg dark:shadow-black/20">
            <div className="flex justify-between items-start">
                <div><p className="text-sm text-gray-500 dark:text-gray-400">Sisa Budget Bulan Ini</p><p className={`text-3xl font-bold ${sisaBudget >= 0 ? 'text-theme-gold' : 'text-rose-500'}`}>{formatCurrency(sisaBudget)}</p></div>
                <button onClick={() => { setBudgetInput(budget > 0 ? new Intl.NumberFormat('id-ID').format(budget) : ""); openModal(setIsBudgetModalOpen); }} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-150 active:scale-95"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
            </div>
            <div className="mt-4">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden"><div className={`h-2.5 rounded-full transition-all duration-500 ${budgetProgress > 100 ? 'bg-rose-500' : 'bg-theme-gold'}`} style={{ width: `${Math.min(budgetProgress, 100)}%` }}></div></div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1.5"><span>Pengeluaran: {formatCurrency(totalNominal)}</span><span>Budget: {formatCurrency(budget)}</span></div>
            </div>
        </div>

        <h2 className="text-xl font-semibold mb-4 text-gray-700 dark:text-gray-300">Detail Transaksi</h2>
        {loading && <div className="text-center p-8"><p className="text-xl">Memuat data awal...</p></div>}
        {error && <div className="bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-300 p-4 rounded-lg text-center"><p>{error}</p></div>}
        
        {!loading && (
            <div className="space-y-3">
                {transactions.map((trx, index) => {
                    const content = (
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md dark:shadow-black/20">
                            <div className="flex justify-between items-start">
                                <div>
                                    <span className="font-semibold text-gray-800 dark:text-gray-100">{trx.categories?.name || 'Tanpa Kategori'}</span>
                                    <span className="block text-xs text-gray-500 dark:text-gray-400">{formatTanggal(trx.tanggal)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-lg text-theme-gold">{trx.nominal_transaksi}</span>
                                    <button onClick={() => handleOpenEditModal(trx)} className="p-1 rounded-full text-gray-400 hover:text-theme-gold transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg></button>
                                </div>
                            </div>
                            {trx.deskripsi && (<p className="text-sm text-gray-600 dark:text-gray-300 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">{trx.deskripsi}</p>)}
                        </div>
                    );
                    if (transactions.length === index + 1) {
                        return <div ref={lastTransactionElementRef} key={trx.id}>{content}</div>
                    }
                    return <div key={trx.id}>{content}</div>
                })}
                {loadingMore && <div className="text-center p-4 text-gray-500">Memuat lebih banyak...</div>}
                {!hasMore && transactions.length > 0 && <div className="text-center p-4 text-gray-500">Anda telah mencapai akhir daftar.</div>}
                {!loading && transactions.length === 0 && <div className="text-center p-8 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-2xl shadow-md">Tidak ada data untuk bulan ini.</div>}
            </div>
        )}
      </div>

      <button onClick={() => openModal(setIsTransactionModalOpen)} className="fixed z-30 bottom-6 right-6 bg-theme-gold text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:opacity-90 transition-all duration-150 active:scale-95" aria-label="Tambah Transaksi Baru"><svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg></button>

      {isTransactionModalOpen && (<div className={`fixed inset-0 flex justify-center items-center z-40 transition-opacity duration-300 ${isTransactionModalVisible ? 'bg-black bg-opacity-70' : 'bg-opacity-0'}`} onClick={closeTransactionModal}><div className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl w-full max-w-sm border border-gray-200 dark:border-gray-700 transition-all duration-300 ${isTransactionModalVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`} onClick={(e) => e.stopPropagation()}><h3 className="text-xl font-semibold mb-4">{editingTransaction ? 'Edit Kategori Transaksi' : 'Tambah Transaksi Baru'}</h3><div className="space-y-4"><div><label className="text-sm text-gray-500 dark:text-gray-400">Nominal</label><input type="text" inputMode="numeric" value={newTransactionNominal} onChange={(e) => handleInputChangeWithFormatting(e.target.value, setNewTransactionNominal)} placeholder="0" className="w-full p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-theme-gold disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:cursor-not-allowed" disabled={!!editingTransaction} /></div><div><label className="text-sm text-gray-500 dark:text-gray-400">Kategori</label><select value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)} className="w-full p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-theme-gold"><option value="" disabled>Pilih Kategori</option>{categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></div><div><label className="text-sm text-gray-500 dark:text-gray-400">Catatan (Opsional)</label><input type="text" value={newTransactionDesc} onChange={(e) => setNewTransactionDesc(e.target.value)} placeholder="Contoh: Makan siang di kantor" className="w-full p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-theme-gold disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:cursor-not-allowed" disabled={!!editingTransaction} /></div></div><div className="flex justify-end gap-4 mt-6"><button onClick={closeTransactionModal} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-700 text-gray-800 dark:text-white font-bold py-2 px-4 rounded-lg transition-transform duration-150 active:scale-95">Batal</button><button onClick={handleSaveTransaction} className="bg-theme-gold hover:opacity-90 text-white font-bold py-2 px-4 rounded-lg transition-transform duration-150 active:scale-95">Simpan</button></div></div></div>)}
      {isBudgetModalOpen && (<div className={`fixed inset-0 flex justify-center items-center z-40 transition-opacity duration-300 ${isBudgetModalVisible ? 'bg-black bg-opacity-70' : 'bg-opacity-0'}`} onClick={closeBudgetModal}><div className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl w-full max-w-sm border border-gray-200 dark:border-gray-700 transition-all duration-300 ${isBudgetModalVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`} onClick={(e) => e.stopPropagation()}><h3 className="text-xl font-semibold mb-4">Atur Budget untuk {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(currentMonth)}</h3><input type="text" inputMode="numeric" value={budgetInput} onChange={(e) => handleInputChangeWithFormatting(e.target.value, setBudgetInput)} placeholder="Masukkan jumlah budget" className="w-full p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-theme-gold" /><div className="flex justify-end gap-4 mt-4"><button onClick={closeBudgetModal} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-700 text-gray-800 dark:text-white font-bold py-2 px-4 rounded-lg transition-transform duration-150 active:scale-95">Batal</button><button onClick={handleSaveBudget} className="bg-theme-gold hover:opacity-90 text-white font-bold py-2 px-4 rounded-lg transition-transform duration-150 active:scale-95">Simpan</button></div></div></div>)}
      {isNotificationBlockedModalOpen && (<div className={`fixed inset-0 flex justify-center items-center z-40 transition-opacity duration-300 ${isNotificationBlockedModalVisible ? 'bg-black bg-opacity-70' : 'bg-opacity-0'}`} onClick={closeNotificationBlockedModal}><div className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl w-full max-w-sm border border-gray-200 dark:border-gray-700 transition-all duration-300 ${isNotificationBlockedModalVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`} onClick={(e) => e.stopPropagation()}><h3 className="text-xl font-semibold mb-4">Notifikasi Diblokir</h3><p className="text-gray-600 dark:text-gray-300 mb-4">Untuk mengaktifkan notifikasi kembali, Anda harus mengubahnya di pengaturan browser untuk situs ini.</p><p className="text-gray-600 dark:text-gray-300">Cari ikon gembok (🔒) di sebelah alamat situs, klik, lalu ubah izin Notifikasi menjadi "Izinkan".</p><div className="flex justify-end gap-4 mt-6"><button onClick={closeNotificationBlockedModal} className="bg-theme-gold hover:opacity-90 text-white font-bold py-2 px-4 rounded-lg transition-transform duration-150 active:scale-95">Mengerti</button></div></div></div>)}
      {isCategoryModalOpen && (<div className={`fixed inset-0 flex justify-center items-center z-40 transition-opacity duration-300 ${isCategoryModalVisible ? 'bg-black bg-opacity-70' : 'bg-opacity-0'}`} onClick={closeCategoryModal}><div className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl w-full max-w-sm border border-gray-200 dark:border-gray-700 transition-all duration-300 ${isCategoryModalVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`} onClick={(e) => e.stopPropagation()}><h3 className="text-xl font-semibold mb-4">Kelola Kategori</h3><div className="space-y-2 max-h-60 overflow-y-auto mb-4 p-1">{categories.map(cat => (<div key={cat.id} className="flex justify-between items-center bg-gray-100 dark:bg-gray-700 p-2 rounded-lg"><span>{cat.name}</span><button onClick={() => handleDeleteCategory(cat.id)} className="p-1 text-rose-500 hover:text-rose-700"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div>))}</div><div className="flex gap-2 mt-4"><input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Nama kategori baru" className="flex-grow w-full p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-theme-gold" /><button onClick={handleAddCategory} className="bg-theme-gold text-white p-2 rounded-lg">Tambah</button></div><div className="flex justify-end gap-4 mt-6"><button onClick={closeCategoryModal} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-700 text-gray-800 dark:text-white font-bold py-2 px-4 rounded-lg">Tutup</button></div></div></div>)}
    </div>
  );
}

export default App;
