/** @type {import('tailwindcss').Config} */
export default {
  // PERBAIKAN: Tambahkan baris ini untuk mengaktifkan dark mode via class
  darkMode: 'class', 
  
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
        // Anda bisa menambahkan warna kustom di sini jika perlu
        colors: {
            'theme-gold': '#a1884f',
        }
    },
  },
  plugins: [],
}
