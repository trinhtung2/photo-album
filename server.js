const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

// Thư mục
const DATA_DIR = path.join(__dirname, 'data');
const PHOTOS_FILE = path.join(DATA_DIR, 'photos.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ORIGINAL_DIR = path.join(__dirname, 'uploads', 'original');
const COMPRESSED_DIR = path.join(__dirname, 'uploads', 'compressed');
const TRASH_DIR = path.join(__dirname, 'uploads', 'trash');

// Đảm bảo thư mục tồn tại
[ORIGINAL_DIR, COMPRESSED_DIR, TRASH_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Middleware
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads/compressed', express.static(COMPRESSED_DIR));
app.use('/uploads/original', express.static(ORIGINAL_DIR));

// Mật khẩu admin
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ========== SETTINGS ==========
function defaultSettings() {
  return {
    title: 'Album Ảnh',
    lastTitleChange: null,
    driveLink: '',
    notes: [],
    lastUpdate: Date.now()
  };
}

function readSettings() {
  try {
    const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return { ...defaultSettings(), ...JSON.parse(data) };
  } catch {
    return defaultSettings();
  }
}

function writeSettings(settings) {
  settings.lastUpdate = Date.now();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// ========== PHOTOS ==========
function readPhotos() {
  try {
    const data = fs.readFileSync(PHOTOS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writePhotos(photos) {
  fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 2));
  // Cập nhật lastUpdate để client biết có thay đổi
  const s = readSettings();
  s.lastUpdate = Date.now();
  writeSettings(s);
}

// Multer
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh'));
  }
});

// ========== API CLIENT ==========

// Lấy settings (title + notes + drive + lastUpdate)
app.get('/api/settings', (req, res) => {
  const s = readSettings();
  res.json({
    title: s.title,
    driveLink: s.driveLink,
    notes: s.notes,
    lastUpdate: s.lastUpdate
  });
});

// Lấy danh sách ảnh (chưa xóa)
app.get('/api/photos', (req, res) => {
  const photos = readPhotos().filter(p => !p.deletedAt);
  photos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json(photos);
});

// Like / Unlike
app.post('/api/photos/:id/like', (req, res) => {
  const photos = readPhotos();
  const photo = photos.find(p => p.id === req.params.id && !p.deletedAt);
  if (!photo) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

  photo.likes = (photo.likes || 0) + (req.body.liked ? 1 : -1);
  if (photo.likes < 0) photo.likes = 0;
  writePhotos(photos);
  res.json({ likes: photo.likes });
});

// Tải 1 ảnh gốc
app.get('/api/download/:id', (req, res) => {
  const photos = readPhotos();
  const photo = photos.find(p => p.id === req.params.id && !p.deletedAt);
  if (!photo) return res.status(404).send('Không tìm thấy');

  const filePath = path.join(ORIGINAL_DIR, photo.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File không tồn tại');

  res.download(filePath, photo.originalName || photo.filename);
});

// Tải toàn bộ (zip, không nén thêm)
app.get('/api/download-all', (req, res) => {
  const photos = readPhotos().filter(p => !p.deletedAt);
  if (photos.length === 0) return res.status(404).send('Không có ảnh');

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename=album-anh.zip');

  const archive = archiver('zip', { zlib: { level: 0 } });
  archive.pipe(res);

  photos.forEach(photo => {
    const filePath = path.join(ORIGINAL_DIR, photo.filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: photo.originalName || photo.filename });
    }
  });

  archive.finalize();
});

// ========== API ADMIN ==========
function checkAdmin(req, res, next) {
  const password = req.headers['x-admin-password'] || req.query.password;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Sai mật khẩu admin' });
  }
  next();
}

// Lấy tất cả ảnh (kể cả đã xóa)
app.get('/api/admin/photos', checkAdmin, (req, res) => {
  const photos = readPhotos();
  photos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json(photos);
});

// Upload ảnh
app.post('/api/admin/upload', checkAdmin, upload.array('photos', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Không có file nào' });
    }

    const photos = readPhotos();
    const dateGroup = req.body.dateGroup || new Date().toISOString().slice(0, 10);
    const uploaded = [];

    for (const file of req.files) {
      const id = uuidv4();
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const filename = `${id}${ext}`;

      // Lưu gốc
      fs.writeFileSync(path.join(ORIGINAL_DIR, filename), file.buffer);

      // Nén hiển thị (max 1600px, quality 80)
      await sharp(file.buffer)
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, progressive: true })
        .toFile(path.join(COMPRESSED_DIR, filename));

      const photo = {
        id,
        filename,
        originalName: file.originalname,
        dateGroup,
        uploadedAt: new Date().toISOString(),
        likes: 0,
        deletedAt: null
      };
      photos.push(photo);
      uploaded.push(photo);
    }

    writePhotos(photos);
    res.json({ success: true, count: uploaded.length, photos: uploaded });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Soft delete
app.post('/api/admin/photos/:id/delete', checkAdmin, (req, res) => {
  const photos = readPhotos();
  const photo = photos.find(p => p.id === req.params.id);
  if (!photo) return res.status(404).json({ error: 'Không tìm thấy' });
  photo.deletedAt = new Date().toISOString();
  writePhotos(photos);
  res.json({ success: true });
});

// Khôi phục
app.post('/api/admin/photos/:id/restore', checkAdmin, (req, res) => {
  const photos = readPhotos();
  const photo = photos.find(p => p.id === req.params.id);
  if (!photo) return res.status(404).json({ error: 'Không tìm thấy' });
  photo.deletedAt = null;
  writePhotos(photos);
  res.json({ success: true });
});

// Xóa vĩnh viễn
app.delete('/api/admin/photos/:id', checkAdmin, (req, res) => {
  const photos = readPhotos();
  const idx = photos.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });

  const photo = photos[idx];
  [ORIGINAL_DIR, COMPRESSED_DIR].forEach(dir => {
    const fp = path.join(dir, photo.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });

  photos.splice(idx, 1);
  writePhotos(photos);
  res.json({ success: true });
});

// Soft delete toàn bộ ảnh đang active (hoặc theo ngày)
app.post('/api/admin/photos/delete-all', checkAdmin, (req, res) => {
  const { dateGroup } = req.body || {};
  const photos = readPhotos();
  let count = 0;
  photos.forEach(p => {
    if (!p.deletedAt) {
      if (!dateGroup || p.dateGroup === dateGroup) {
        p.deletedAt = new Date().toISOString();
        count++;
      }
    }
  });
  writePhotos(photos);
  res.json({ success: true, count });
});

// Xóa vĩnh viễn toàn bộ thùng rác
app.post('/api/admin/photos/purge-trash', checkAdmin, (req, res) => {
  const photos = readPhotos();
  const remaining = [];
  let count = 0;
  photos.forEach(p => {
    if (p.deletedAt) {
      [ORIGINAL_DIR, COMPRESSED_DIR].forEach(dir => {
        const fp = path.join(dir, p.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      });
      count++;
    } else {
      remaining.push(p);
    }
  });
  writePhotos(remaining);
  res.json({ success: true, count });
});

// Tải theo ngày (zip)
app.get('/api/download-date/:date', (req, res) => {
  const date = req.params.date;
  const photos = readPhotos().filter(p => !p.deletedAt && p.dateGroup === date);
  if (photos.length === 0) return res.status(404).send('Không có ảnh ngày này');

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename=album-${date}.zip`);

  const archive = archiver('zip', { zlib: { level: 0 } });
  archive.pipe(res);

  photos.forEach(photo => {
    const filePath = path.join(ORIGINAL_DIR, photo.filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: photo.originalName || photo.filename });
    }
  });

  archive.finalize();
});

// Tự động xóa soft-delete sau 7 ngày
function autoCleanTrash() {
  const photos = readPhotos();
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  let changed = false;

  for (let i = photos.length - 1; i >= 0; i--) {
    const photo = photos[i];
    if (photo.deletedAt) {
      const deletedTime = new Date(photo.deletedAt).getTime();
      if (now - deletedTime > sevenDays) {
        [ORIGINAL_DIR, COMPRESSED_DIR].forEach(dir => {
          const fp = path.join(dir, photo.filename);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        });
        photos.splice(i, 1);
        changed = true;
      }
    }
  }
  if (changed) writePhotos(photos);
}
setInterval(autoCleanTrash, 60 * 60 * 1000);
autoCleanTrash();

// ========== DRIVE LINK (trong tab Đăng ảnh) ==========
app.post('/api/admin/drive-link', checkAdmin, (req, res) => {
  const { link } = req.body;
  const s = readSettings();
  s.driveLink = (link || '').trim();
  writeSettings(s);
  res.json({ success: true, link: s.driveLink });
});

// ========== NOTES (thông tin) ==========
app.get('/api/admin/notes', checkAdmin, (req, res) => {
  const s = readSettings();
  res.json(s.notes || []);
});

app.post('/api/admin/notes', checkAdmin, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Nội dung trống' });

  const s = readSettings();
  const note = {
    id: uuidv4(),
    content: content.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  s.notes.unshift(note);
  writeSettings(s);
  res.json({ success: true, note });
});

app.put('/api/admin/notes/:id', checkAdmin, (req, res) => {
  const { content } = req.body;
  const s = readSettings();
  const note = s.notes.find(n => n.id === req.params.id);
  if (!note) return res.status(404).json({ error: 'Không tìm thấy' });

  note.content = (content || '').trim();
  note.updatedAt = new Date().toISOString();
  writeSettings(s);
  res.json({ success: true, note });
});

app.delete('/api/admin/notes/:id', checkAdmin, (req, res) => {
  const s = readSettings();
  s.notes = s.notes.filter(n => n.id !== req.params.id);
  writeSettings(s);
  res.json({ success: true });
});

// ========== ĐỔI TÊN TRANG (1 lần / 7 ngày) ==========
app.post('/api/admin/title', checkAdmin, (req, res) => {
  const { title, password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Sai mật khẩu admin' });
  }
  if (!title || title.trim().length < 2) {
    return res.status(400).json({ error: 'Tên trang quá ngắn' });
  }

  const s = readSettings();
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  if (s.lastTitleChange && (now - s.lastTitleChange) < sevenDays) {
    const remain = Math.ceil((sevenDays - (now - s.lastTitleChange)) / (24 * 60 * 60 * 1000));
    return res.status(429).json({ error: `Chỉ được đổi tên 1 lần / 7 ngày. Còn khoảng ${remain} ngày.` });
  }

  s.title = title.trim().slice(0, 60);
  s.lastTitleChange = now;
  writeSettings(s);
  res.json({ success: true, title: s.title });
});

// Lấy info admin (title + cooldown)
app.get('/api/admin/info', checkAdmin, (req, res) => {
  const s = readSettings();
  let canChangeTitle = true;
  let remainDays = 0;
  if (s.lastTitleChange) {
    const passed = Date.now() - s.lastTitleChange;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (passed < sevenDays) {
      canChangeTitle = false;
      remainDays = Math.ceil((sevenDays - passed) / (24 * 60 * 60 * 1000));
    }
  }
  res.json({
    title: s.title,
    canChangeTitle,
    remainDays,
    driveLink: s.driveLink
  });
});

// Trang
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`   - Khách:  http://localhost:${PORT}`);
  console.log(`   - Admin:  http://localhost:${PORT}/admin`);
  console.log(`   - Mật khẩu mặc định: admin123\n`);
});
