import React, { useState, useEffect, useRef, useCallback } from 'react';
// Mengimpor createClient langsung dari CDN untuk mengatasi masalah resolusi modul
import { createClient, User } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

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
  category_id: number | null;
  categories: { id: number; name: string } | null;
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
  // --- State Management ---
  const [user, setUser] = useState<User | null>(null);
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

  // --- Logika Tema Persisten ---
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme === 'light' ? 'light' : 'dark';
  });

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

  // Efek untuk menangani autentikasi dan mengambil tema pengguna saat aplikasi dimuat
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('theme')
          .eq('user_id', currentUser.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Gagal mengambil tema:', error.message);
          return;
        }

        if (data && data.theme && data.theme !== theme) {
            setTheme(data.theme);
        }
      } else {
        const localTheme = localStorage.getItem('theme') || 'dark';
        setTheme(localTheme);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Efek untuk menerapkan kelas tema ke elemen HTML dan menyimpannya
  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem('theme', theme);

    if (user) {
      const saveThemeToDb = async () => {
        const { error } = await supabase
          .from('user_preferences')
          .upsert({ user_id: user.id, theme: theme }, { onConflict: 'user_id' });
        
        if (error) {
          console.error('Gagal menyimpan tema ke database:', error.message);
        }
      };
      saveThemeToDb();
    }
  }, [theme, user]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    // ... sisa kode push notification Anda ...
  }, []);


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
    return permission;
  };

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
        const categoryId = parseInt(selectedCategoryId);
        const { error: updateError } = await supabase
            .from('tes')
            .update({ category_id: categoryId })
            .eq('id', editingTransaction.id);
        error = updateError;

        if (!updateError) {
            const updatedCategory = categories.find(cat => cat.id === categoryId);
            setTransactions(prevTransactions => 
                prevTransactions.map(trx => 
                    trx.id === editingTransaction.id 
                        ? { ...trx, category_id: categoryId, categories: updatedCategory || null } 
                        : trx
                )
            );
        }
    } else {
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
      const { data, error } = await supabase.from('categories').insert([{ name: newCategoryName }]).select().single();
      if (error) {
        alert("Gagal menambah kategori: " + error.message);
      } else if (data) {
        setCategories(prev => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)));
        setNewCategoryName("");
      }
  };
  
  const handleDeleteCategory = async (id: number) => {
      if (!confirm("Yakin ingin menghapus kategori ini? Semua transaksi terkait akan kehilangan kategorinya.")) return;
      const { error: updateError } = await supabase.from('tes').update({ category_id: null }).eq('category_id', id);
      if (updateError) {
          alert("Gagal memperbarui transaksi terkait: " + updateError.message);
          return;
      }
      const { error: deleteError } = await supabase.from('categories').delete().eq('id', id);
      if (deleteError) {
        alert("Gagal menghapus kategori: " + deleteError.message);
      } else {
        setCategories(prev => prev.filter(cat => cat.id !== id));
        setTransactions(prevTrx => prevTrx.map(trx => trx.category_id === id ? {...trx, category_id: null, categories: null} : trx));
      }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setIsPickerOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerRef]);

  // --- PERBAIKAN BUG DIMULAI DI SINI ---

  // Efek ini sekarang HANYA untuk memuat data awal saat bulan berubah.
  useEffect(() => {
    const fetchInitialTransactions = async () => {
      setLoading(true);
      setTransactions([]);
      setPage(0);
      setError(null);
      
      try {
        const startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59, 999);
        
        const { data, error: dbError } = await supabase
          .from('tes')
          .select('*, categories(id, name)')
          .gte('tanggal', startDate.toISOString())
          .lte('tanggal', endDate.toISOString())
          .order('tanggal', { ascending: false })
          .range(0, ITEMS_PER_PAGE - 1);

        if (dbError) throw dbError;

        if (data) {
          setTransactions(data as Transaction[]);
          setHasMore(data.length === ITEMS_PER_PAGE);
        } else {
          setHasMore(false);
        }
      } catch (err: any) {
        setError(`Gagal mengambil data: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialTransactions();
  }, [currentMonth]);

  // Efek ini sekarang HANYA untuk pagination (memuat lebih banyak).
  useEffect(() => {
    if (page === 0) return; // Jangan jalankan pada pemuatan awal

    const fetchMoreTransactions = async () => {
      if (!hasMore || loadingMore) return;
      setLoadingMore(true);
      
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

        if (data && data.length > 0) {
          setTransactions(prev => [...prev, ...data as Transaction[]]);
          setHasMore(data.length === ITEMS_PER_PAGE);
        } else {
          setHasMore(false);
        }
      } catch (err: any) {
        setError(`Gagal mengambil data: ${err.message}`);
      } finally {
        setLoadingMore(false);
      }
    };

    fetchMoreTransactions();
  }, [page]);
  
  // --- PERBAIKAN BUG SELESAI DI SINI ---

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
          switch (payload.eventType) {
              case 'INSERT':
                  const newRecord = payload.new as Transaction;
                  const newRecordDate = new Date(newRecord.tanggal);
                  if (newRecordDate.getFullYear() === currentMonth.getFullYear() && newRecordDate.getMonth() === currentMonth.getMonth()) {
                      const newCategory = categories.find(cat => cat.id === newRecord.category_id);
                      setTransactions(prev => {
                          const isAlreadyPresent = prev.some(trx => trx.id === newRecord.id);
                          return isAlreadyPresent ? prev : [{ ...newRecord, categories: newCategory || null }, ...prev];
                      });
                  }
                  break;
              case 'UPDATE':
                  const updatedRecord = payload.new as Transaction;
                  const updatedCategory = categories.find(cat => cat.id === updatedRecord.category_id);
                  setTransactions(prev => 
                      prev.map(trx => 
                          trx.id === updatedRecord.id 
                              ? { ...trx, ...updatedRecord, categories: updatedCategory || null } 
                              : trx
                      )
                  );
                  break;
              case 'DELETE':
                  setTransactions(prev => prev.filter(trx => trx.id !== payload.old.id));
                  break;
              default:
                  break;
          }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets' }, () => {
          const yearMonth = getYearMonthString(currentMonth);
          supabase.from('budgets').select('amount').eq('year_month', yearMonth).single().then(({data}) => setBudget(data?.amount || 0));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, (payload) => {
          switch (payload.eventType) {
            case 'INSERT':
              setCategories(prev => [...prev, payload.new as Category].sort((a,b) => a.name.localeCompare(b.name)));
              break;
            case 'DELETE':
              setCategories(prev => prev.filter(cat => cat.id !== payload.old.id));
              break;
            default:
              break;
          }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentMonth, categories]);

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

      {isTransactionModalOpen && (<div className={`fixed inset-0 flex justify-center items-center z-40 transition-opacity duration-300 ${isTransactionModalVisible ? 'bg-black bg-opacity-70' : 'bg-opacity-0'}`} onClick={closeTransactionModal}><div className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl w-full max-w-sm border border-gray-200 dark:border-gray-700 transition-all duration-300 ${isTransactionModalVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`} onClick={(e) => e.stopPropagation()}><h3 className="text-xl font-semibold mb-4">{editingTransaction ? 'Edit Kategori Transaksi' : 'Tambah Transaksi Baru'}</h3><div className="space-y-4">
        
        {!editingTransaction && (
          <>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Nominal</label>
              <input type="text" inputMode="numeric" value={newTransactionNominal} onChange={(e) => handleInputChangeWithFormatting(e.target.value, setNewTransactionNominal)} placeholder="0" className="w-full p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-theme-gold" />
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">Catatan (Opsional)</label>
              <input type="text" value={newTransactionDesc} onChange={(e) => setNewTransactionDesc(e.target.value)} placeholder="Contoh: Makan siang di kantor" className="w-full p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-theme-gold" />
            </div>
          </>
        )}
        
        <div>
          <label className="text-sm text-gray-500 dark:text-gray-400">Kategori</label>
          <div className="relative">
            <select value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)} className="w-full p-2 pr-10 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-theme-gold appearance-none cursor-pointer">
              <option value="" disabled>Pilih Kategori...</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700 dark:text-gray-300"><svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg></div>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={closeTransactionModal} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-500 transition-all duration-150 active:scale-95">Batal</button>
          <button onClick={handleSaveTransaction} className="px-4 py-2 rounded-lg bg-theme-gold text-white hover:opacity-90 transition-all duration-150 active:scale-95">{editingTransaction ? 'Simpan Perubahan' : 'Tambah'}</button>
        </div>
      </div></div></div>)}

      {isBudgetModalOpen && (<div className={`fixed inset-0 flex justify-center items-center z-40 transition-opacity duration-300 ${isBudgetModalVisible ? 'bg-black bg-opacity-70' : 'bg-opacity-0'}`} onClick={closeBudgetModal}><div className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl w-full max-w-sm border border-gray-200 dark:border-gray-700 transition-all duration-300 ${isBudgetModalVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`} onClick={(e) => e.stopPropagation()}><h3 className="text-xl font-semibold mb-4">Atur Budget Bulanan</h3><div className="space-y-4"><div><label className="text-sm text-gray-500 dark:text-gray-400">Nominal Budget</label><input type="text" inputMode="numeric" value={budgetInput} onChange={(e) => handleInputChangeWithFormatting(e.target.value, setBudgetInput)} placeholder="0" className="w-full p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-theme-gold" /></div></div><div className="flex justify-end gap-3 pt-4"><button onClick={closeBudgetModal} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-500 transition-all duration-150 active:scale-95">Batal</button><button onClick={handleSaveBudget} className="px-4 py-2 rounded-lg bg-theme-gold text-white hover:opacity-90 transition-all duration-150 active:scale-95">Simpan</button></div></div></div>)}

      {isNotificationBlockedModalOpen && (<div className={`fixed inset-0 flex justify-center items-center z-40 transition-opacity duration-300 ${isNotificationBlockedModalVisible ? 'bg-black bg-opacity-70' : 'bg-opacity-0'}`} onClick={closeNotificationBlockedModal}><div className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700 transition-all duration-300 ${isNotificationBlockedModalVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`} onClick={(e) => e.stopPropagation()}><h3 className="text-xl font-semibold mb-2">Notifikasi Diblokir</h3><p className="text-gray-600 dark:text-gray-300 mb-4">Anda telah memblokir izin notifikasi untuk situs ini. Untuk mengaktifkannya kembali, Anda perlu mengubah pengaturan di browser Anda.</p><div className="text-sm bg-gray-100 dark:bg-gray-700/50 p-3 rounded-lg">Klik ikon gembok (🔒) di sebelah kiri alamat URL di browser Anda, lalu ubah pengaturan Notifikasi menjadi "Izinkan" (Allow).</div><div className="flex justify-end pt-4"><button onClick={closeNotificationBlockedModal} className="px-4 py-2 rounded-lg bg-theme-gold text-white hover:opacity-90 transition-all duration-150 active:scale-95">Mengerti</button></div></div></div>)}
      
      {isCategoryModalOpen && (<div className={`fixed inset-0 flex justify-center items-center z-40 transition-opacity duration-300 ${isCategoryModalVisible ? 'bg-black bg-opacity-70' : 'bg-opacity-0'}`} onClick={closeCategoryModal}><div className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700 transition-all duration-300 ${isCategoryModalVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`} onClick={(e) => e.stopPropagation()}><h3 className="text-xl font-semibold mb-4">Kelola Kategori</h3><div className="mb-4"><h4 className="font-semibold mb-2">Tambah Kategori Baru</h4><div className="flex gap-2"><input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Nama Kategori" className="flex-grow p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-theme-gold" /><button onClick={handleAddCategory} className="px-4 py-2 rounded-lg bg-theme-gold text-white hover:opacity-90 transition-all duration-150 active:scale-95">Tambah</button></div></div><div className="space-y-2 max-h-60 overflow-y-auto pr-2"><h4 className="font-semibold mb-2">Daftar Kategori</h4>{categories.map(cat => (<div key={cat.id} className="flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-700/50 rounded-lg"><span>{cat.name}</span><button onClick={() => handleDeleteCategory(cat.id)} className="p-1 text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg></button></div>))}</div><div className="flex justify-end pt-4"><button onClick={closeCategoryModal} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-500 transition-all duration-150 active:scale-95">Tutup</button></div></div></div>)}
    </div>
  );
}

export default App;
