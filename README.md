# App Tracking Tài Xế Ra Vào Cổng

Web app theo dõi tài xế xuất hàng: tài xế quét QR cổng bằng camera, quét nhiều đơn hàng (đơn ghép), bắt đầu / kết thúc xuất hàng; kèm dashboard trực quan theo cổng và xe.

## Tính năng

- **Trang tài xế (`/`)** – mobile-first:
  1. Chọn xe từ **kế hoạch vận tải hôm nay** (hoặc đăng ký mới nếu xe phát sinh).
  2. Quét QR **cổng xuất hàng** → tạo phiên.
  3. Quét **đơn hàng xuất thực tế** (kho), chặn trùng, xóa đơn sai.
  4. Bấm **Bắt đầu xuất hàng** (ước tính 30 phút).
  5. Bấm **Xuất xong**.
- **Kế hoạch vận tải (`/ke-hoach`)** – import Excel/CSV có preview, hoặc nhập tay; sửa/xóa kế hoạch theo ngày.
- **Dashboard kế hoạch xuất (`/ke-hoach/dashboard`)** – lưới cổng × giờ giống Excel, thống kê tấn/lệnh/xe (đã lấy / còn lại), hàng đợi xe.
- **Dashboard kho (`/dashboard`)** – theo dõi cổng/xe realtime, lọc, phân trang, xuất Excel.
- **Quản lý ẩn (`/ql-du-lieu`)** – CRUD lịch sử (PIN bảo vệ).

## Công nghệ

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- SQLite qua `@libsql/client` — local: file `data/tracking.db`; production (Vercel): [Turso](https://turso.tech)
- Quét QR/mã vạch bằng camera trình duyệt qua `@yudiel/react-qr-scanner`

## Chạy dự án

```bash
npm install
npm run dev
```

Mở http://localhost:3000 (tài xế), http://localhost:3000/ke-hoach (kế hoạch VT), http://localhost:3000/ke-hoach/dashboard (dashboard KH), http://localhost:3000/dashboard (kho).

## Import kế hoạch vận tải (Excel/CSV)

Mỗi **dòng = 1 đơn/lệnh**. Header dòng đầu:

| Cột | Bắt buộc | Ví dụ | Ghi chú |
| --- | --- | --- | --- |
| Ngày | Có | 2026-06-13 hoặc 13/06/2026 | Ngày kế hoạch |
| Cổng | Có | Cua 3, TH | Cổng vào → cột lưới |
| Giờ | Có | 6h30, 7h | Giờ dự kiến → hàng lưới |
| Mã đơn | Có | HCM1, TINH-47 | Mã đơn/lệnh |
| Số tấn | Không | 1.2 | Số tấn (thống kê) |
| Số xe | Không | 51C-123.45 | Biển số → tài xế chọn xe |
| Tài xế | Không | Nguyen Van A | Tên tài xế |

App cũng đọc được tên cột không dấu: `Ngay`, `Cong`, `Gio`, `MaDon`, `SoTan`, `SoXe`, `TaiXe`.

**Phân ca:** giờ < 12:00 = sáng, >= 12:00 = chiều.

**Mẫu nhanh (copy vào Excel):**

```
Ngày       | Cổng   | Giờ  | Mã đơn   | Số tấn | Số xe     | Tài xế
2026-06-13 | Cua 3  | 6h30 | HCM1     | 1.2    | 51C-111   | Tran A
2026-06-13 | Cua 3  | 6h30 | HCM2     | 0.8    | 51C-111   | Tran A
2026-06-13 | Cua 5  | 7h   | TINH-47  | 2.0    | 51C-222   | Le B
2026-06-13 | TH     | 19h  | CHIEU-01 | 1.5    | 51C-333   |
```

Luồng: Transport import tại `/ke-hoach` → preview → Lưu → Dashboard KH hiển thị lưới → Tài xế chọn xe tại `/` → scan thực tế.

**Tải file mẫu:** trên trang `/ke-hoach` bấm **Tải mẫu Excel**, hoặc mở `/api/plans/template?date=2026-06-13`.

Build production:

```bash
npm run build
npm run start
```

## Deploy lên Vercel (database)

Vercel **không hỗ trợ** ghi file SQLite local. App dùng **Turso** (SQLite trên cloud, miễn phí tier).

### Bước 1: Tạo database Turso

1. Đăng ký tại https://turso.tech và cài CLI (hoặc tạo DB trên dashboard web).
2. Tạo database:

```bash
turso db create gate-tracking
turso db show gate-tracking --url
turso db tokens create gate-tracking
```

3. Lấy 2 giá trị:
   - **URL** dạng `libsql://gate-tracking-xxx.turso.io`
   - **Auth token** (chuỗi dài)

### Bước 2: Thêm biến môi trường trên Vercel

Vào project Vercel → **Settings → Environment Variables**, thêm:

| Tên | Giá trị |
| --- | --- |
| `TURSO_DATABASE_URL` | URL từ bước 1 |
| `TURSO_AUTH_TOKEN` | Token từ bước 1 |
| `ADMIN_SECRET` | Mã PIN trang `/ql-du-lieu` (tùy chọn) |

### Bước 3: Redeploy

Sau khi thêm biến môi trường, bấm **Redeploy** trên Vercel. Schema bảng tự tạo khi API chạy lần đầu.

**Local dev:** không cần Turso — app tự dùng file `data/tracking.db`.

## Quan trọng: camera cần HTTPS

Trình duyệt chỉ cho phép truy cập camera ở `localhost` hoặc qua **HTTPS**. Khi test trên điện thoại thật (không phải localhost), hãy chạy sau một domain/HTTPS, ví dụ dùng tunnel:

```bash
npx localtunnel --port 3000
# hoặc
ngrok http 3000
```

Rồi mở link `https://...` mà công cụ trả về trên điện thoại và cấp quyền camera.

## Định dạng QR

App dùng QR chứa **text đơn giản**, nội dung QR chính là giá trị được lưu:

- **QR cổng**: text dạng `GATE-01`, `GATE-02`, ... (dùng làm mã cổng hiển thị trên dashboard).
- **QR đơn hàng**: text là mã đơn, ví dụ `DH-2026-0001`.

### Cách tạo QR để test nhanh

- Online: vào bất kỳ trang "QR code generator" nào, nhập text `GATE-01` rồi tạo ảnh QR để in/dán tại cổng; tương tự tạo QR cho từng mã đơn.
- Hoặc dùng thư viện dòng lệnh:

```bash
npx qrcode "GATE-01" -o gate-01.png
npx qrcode "DH-2026-0001" -o don-1.png
```

Ngoài QR, scanner cũng đọc được các mã vạch phổ biến (Code 128, Code 39, EAN-13, EAN-8, Data Matrix, PDF417).

## API

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| `GET` | `/api/sessions` | Danh sách phiên (cho dashboard) |
| `POST` | `/api/sessions` | Tạo phiên (`driverName`, `vehiclePlate`, `gateCode`) |
| `GET` | `/api/sessions/:id` | Chi tiết 1 phiên |
| `POST` | `/api/sessions/:id/orders` | Thêm đơn (`orderCode`), chặn trùng (409) |
| `DELETE` | `/api/sessions/:id/orders/:orderId` | Xóa đơn quét sai |
| `POST` | `/api/sessions/:id/start-export` | Bắt đầu xuất (ước tính +30 phút) |
| `POST` | `/api/sessions/:id/finish` | Ghi nhận xuất xong |
| `GET` | `/api/plans?date=` | Kế hoạch ngày (lưới + stats + queue) |
| `POST` | `/api/plans` | Thêm đơn kế hoạch (nhập tay) |
| `POST` | `/api/plans/import` | Import hàng loạt |
| `GET` | `/api/plans/template?date=` | Tải file mẫu Excel import |
| `GET` | `/api/plans/trucks?date=` | Danh sách xe cho tài xế |
| `POST` | `/api/plans/walk-in` | Đăng ký xe phát sinh |

## Cấu trúc thư mục

```
app/
  page.tsx                 # Trang tài xế
  ke-hoach/page.tsx        # Kế hoạch vận tải (import + nhập tay)
  ke-hoach/dashboard/      # Dashboard kế hoạch xuất (lưới Excel)
  dashboard/page.tsx       # Dashboard kho
  ql-du-lieu/page.tsx      # Quản lý ẩn
  api/sessions/...         # Phiên scan thực tế
  api/plans/...            # Kế hoạch vận tải
components/
  AppNav.tsx               # Điều hướng giữa các trang
  QrScanner.tsx
  GateCard.tsx
lib/
  db.ts
  sessions.ts
  plans.ts                 # Logic kế hoạch vận tải
  plan-parse.ts            # Parse Excel/import
  types.ts
  format.ts
```

## Ghi chú

- File SQLite nằm trong `data/` và đã được loại khỏi git. Xóa thư mục `data/` để reset toàn bộ dữ liệu.
- Thời gian ước tính xuất hàng (30 phút) cấu hình tại `EXPORT_ESTIMATE_MINUTES` trong [lib/types.ts](lib/types.ts).
