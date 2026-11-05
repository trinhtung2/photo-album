# Album Ảnh Web (Client + Admin) - Phiên bản mới

## Tính năng mới đã thêm

- **Google Drive** nằm chung trong tab **Đăng ảnh**
- **Đăng thông tin / Ghi chú**: admin viết, sửa, xóa → hiện ở đầu trang khách
- **Đổi tên trang web**: 1 lần / 7 ngày, phải nhập lại mật khẩu admin
- **Tự động cập nhật** trang khách mỗi 12 giây khi admin đăng ảnh hoặc sửa thông tin
- Ảnh nén khi đăng (web nhanh), tải về vẫn là bản gốc chất lượng cao

## Chạy trên máy (localhost)

1. Giải nén file zip
2. Mở thư mục `photo-album` trong VS Code
3. Terminal chạy:

```bash
npm install
npm start
```

4. Mở:
   - Khách: http://localhost:3000
   - Admin: http://localhost:3000/admin  
     Mật khẩu mặc định: `admin123`

## Tắt laptop thì web tắt

Đúng. Muốn web chạy 24/24 thì phải đưa lên server online.

### Khuyến nghị miễn phí tốt nhất cho người mới

**1. Render.com (ưu tiên số 1)**
- Free tier
- Có HTTPS sẵn
- Tốc độ tải ảnh: trung bình (lần đầu sau khi ngủ hơi chậm 10-20s)
- Dữ liệu: free tier có thể mất file khi restart → nên backup thư mục `uploads` + `data` thường xuyên

Cách làm nhanh:
1. Đăng ký https://render.com
2. New → Web Service
3. Kết nối GitHub (upload code lên GitHub trước) hoặc dùng "Deploy from ZIP"
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Sau khi deploy xong sẽ có link https://xxxx.onrender.com

**2. Railway.app**
- Free có giới hạn giờ
- Nhanh hơn Render một chút

**3. Dùng ngrok (chỉ để test tạm)**
```bash
npm start
# terminal khác
ngrok http 3000
```
→ được link https tạm thời.

## Dữ liệu nằm ở đâu?

```
photo-album/
├── data/
│   ├── photos.json     ← danh sách ảnh + like
│   └── settings.json   ← tên trang, drive, notes
└── uploads/
    ├── original/       ← ảnh gốc (chất lượng cao)
    ├── compressed/     ← ảnh nén để xem web
    └── trash/
```

- Chạy trên máy bạn: tắt máy **không mất dữ liệu**.
- Chạy trên Render free: có thể mất khi server restart → hãy tải thư mục `uploads` + `data` về máy backup định kỳ.

## Đổi mật khẩu admin

Mở `server.js`, tìm:

```js
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
```

Đổi `admin123` thành mật khẩu bạn muốn.

Hoặc chạy:
```bash
ADMIN_PASSWORD=matkhau_moi npm start
```
