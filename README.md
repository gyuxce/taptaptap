# WAVR

Sistem pencatatan transaksi NFC & digital souvenir terintegrasi untuk destinasi wisata skala besar (50+ merchant partner) berbasis **Next.js 16 (React 19)**, **Tailwind CSS v4**, dan **Supabase**.

Aplikasi ini dilengkapi dengan **Mode Simulasi Uji Coba Offline** yang otomatis berjalan jika kunci API Supabase belum dikonfigurasi, sehingga mempermudah proses review dan testing lokal tanpa memerlukan setup cloud database di awal.

---

## 🚀 Fitur Utama

1. **Terminal Merchant Handal (Mobile View)**:
   - Didesain khusus untuk tampilan mobile scanner (max-width 448px, height 100dvh).
   - Animasi Pulser scan NFC interaktif.
   - Pendaftaran pengunjung baru langsung dari pos loket utama (Zod validated).
   - Riwayat tap real-time + filter tanggal + visual grafik harian (Recharts) + Ekspor data ke CSV.
   - Panel Emulator RFID chip terintegrasi untuk mensimulasikan pemindaian gelang tanpa perangkat pembaca fisik.
2. **Dashboard Admin Panel**:
   - Statistik real-time (Total Wisatawan, Merchant, Taps, Pendapatan Hari Ini) menggunakan custom `StatCard`.
   - Grafik analitik pendapatan 7 hari terakhir (Bar) & frekuensi tap per jam hari ini (Line).
   - Audit trail 10 transaksi tap terbaru dengan sinkronisasi WhatsApp otomatis.
   - Pengelolaan merchant lengkap dengan modul kredensial owner baru.
   - Manajemen wisatawan dengan pelacakan bar limit kredit dan row-expand riwayat tap individual.
3. **WhatsApp Notification Integration**:
   - Notifikasi potong saldo gelang NFC terkirim otomatis ke nomor WhatsApp pengunjung menggunakan API **Fonnte**.
4. **PWA Standalone Support**:
   - Siap di-install sebagai aplikasi mobile native mandiri (mendukung Portrait Mode).

---

## 🛠️ Persyaratan Sistem (Prerequisites)

- **Node.js**: versi 18 atau lebih baru.
- **Supabase Account**: (Opsional, diperlukan untuk Mode Live Database skala produksi).
- **Fonnte Token**: (Opsional, diperlukan untuk fitur notifikasi WhatsApp).

---

## 📦 Panduan Instalasi Lokal

### Langkah 1: Clone & Pasang Dependensi
Buka terminal dan jalankan perintah:
```bash
# Masuk ke folder proyek
cd C:\Users\USER\.gemini\antigravity\scratch\ecotour-tap-system

# Install semua modul dependensi
npm install
```

### Langkah 2: Konfigurasi Environment Variables
Salin file `.env.example` menjadi `.env.local`:
```bash
cp .env.example .env.local
```
Isi variabel di dalam `.env.local` sesuai kebutuhan:
```env
# Supabase API (Biarkan kosong untuk otomatis mengaktifkan MODE SIMULASI OFFLINE)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Fonnte WhatsApp Gateway API Token
FONNTE_TOKEN=your_fonnte_token_here
```

### Langkah 3: Setup Supabase Database (Jika menggunakan Mode Live)
Jika Anda mengonfigurasi variabel API Supabase:
1. Buka dashboard proyek Supabase Anda.
2. Masuk ke menu **SQL Editor**.
3. Buka file `schema.sql` yang berada di direktori root proyek ini, salin seluruh kodenya, tempelkan ke SQL Editor Supabase, lalu jalankan (**Run**).
4. Buat user administrator manual melalui **Auth Dashboard** Supabase.
5. Jalankan query SQL berikut di editor Supabase untuk menetapkan role administrator ke user uuid yang baru dibuat:
   ```sql
   INSERT INTO public.profiles (id, role, merchant_id, merchant_type)
   VALUES ('[UUID_USER_AUTH_ANDA]', 'admin', null, null);
   ```

### Langkah 4: Jalankan Server Pengembang Lokal
Jalankan dev server dengan perintah:
```bash
npm run dev
```
Buka browser di alamat [http://localhost:3000](http://localhost:3000) untuk mengakses aplikasi.

---

## 🎮 Cara Menggunakan Mode Simulasi (Tanpa Supabase)

Jika API Supabase dikosongkan, WAVR otomatis memuat demo simulator lokal menggunakan **Local Storage & Session Storage**:
1. Masuk ke halaman login utama (`http://localhost:3000/`).
2. Klik tombol **Demo Quick Fill** yang tersedia di bagian bawah kartu login:
   - **Admin**: `admin@wavr.com` (Sandi: `demo1234`)
   - **Merchant Loket**: `zipline@wavr.com` (Sandi: `demo1234`)
   - **Merchant Regular**: `cafe@wavr.com` (Sandi: `demo1234`)
3. Di halaman **Merchant Terminal (`/tap`)**:
   - Jika browser Anda tidak mendukung NFC pembaca (misalnya di komputer desktop), gunakan panel **Gelang Simulator** di bagian bawah.
   - Klik salah satu skenario: **VIP**, **Regular**, **Chip Asing Baru**, **Tag Nonaktif**, atau **Kredit Habis** untuk mensimulasikan tapping instan.
   - Klik **Demo Otomatis** untuk menjalankan sequence tapping berkelanjutan.
4. Di halaman **Admin Panel (`/dashboard`)**:
   - Lihat statistik visual, kelola status keaktifan merchant, dan lakukan reset batas kredit wisatawan secara langsung dengan konfirmasi visual dialog.

---

## ☁️ Panduan Deploy ke Vercel

1. Buat proyek baru di [Vercel](https://vercel.com/new).
2. Hubungkan ke repositori WAVR Anda.
3. Tambahkan **Environment Variables** berikut di pengaturan Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FONNTE_TOKEN`
4. Klik **Deploy**. Selesai!

---

## 🌿 Struktur Folder Utama

- `app/` - Routing utama Next.js App Router (Auth, Merchant, Admin, dan API Routes).
- `components/` - Komponen UI reusable (`ui/`), Admin (`admin/`), dan Merchant (`merchant/`).
- `lib/` - Integrasi Supabase client (`supabase.ts`, `supabaseAdmin.ts`), helper utility (`utils.ts`), validations zod (`validations.ts`), dan constants layout (`constants.ts`).
- `types/` - Type definitions TypeScript.
- `public/` - Static assets, logo PWA, dan `manifest.json`.
- `schema.sql` - Skema database relasional lengkap berskala produksi.
