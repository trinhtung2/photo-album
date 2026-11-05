let adminPassword = sessionStorage.getItem('adminPassword') || '';
let currentManageGroup = 'all';
let currentActivePhotos = [];
let selectedFiles = []; // Giữ danh sách file đã chọn (không bị mất khi chọn thêm)

// Login
document.getElementById('btn-login').addEventListener('click', () => {
  const pw = document.getElementById('admin-password').value;
  if (!pw) return alert('Nhập mật khẩu');
  adminPassword = pw;
  sessionStorage.setItem('adminPassword', pw);
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-app').style.display = 'block';
  initAdmin();
});

if (adminPassword) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-app').style.display = 'block';
  initAdmin();
}

document.getElementById('btn-logout').addEventListener('click', () => {
  sessionStorage.removeItem('adminPassword');
  location.reload();
});

function initAdmin() {
  loadManage();
  loadTrash();
  loadDrive();
  loadNotes();
  loadTitleInfo();
}

// Tabs
document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// Default date
document.getElementById('date-group').value = new Date().toISOString().slice(0, 10);

// ========== CHỌN ẢNH (giữ + thêm, xóa từng tấm / xóa hết) ==========
const fileInput = document.getElementById('file-input');
const previewList = document.getElementById('preview-list');
const btnUpload = document.getElementById('btn-upload');

fileInput.addEventListener('change', () => {
  const newFiles = [...fileInput.files];
  // Thêm vào danh sách đã chọn (không ghi đè)
  newFiles.forEach(f => {
    // Tránh trùng tên + size
    const exists = selectedFiles.some(s => s.name === f.name && s.size === f.size);
    if (!exists) selectedFiles.push(f);
  });
  // Reset input để có thể chọn lại cùng file nếu cần
  fileInput.value = '';
  renderPreview();
});

function renderPreview() {
  previewList.innerHTML = '';
  if (selectedFiles.length === 0) {
    btnUpload.disabled = true;
    document.getElementById('btn-clear-all-preview').style.display = 'none';
    return;
  }
  btnUpload.disabled = false;
  document.getElementById('btn-clear-all-preview').style.display = 'inline-block';

  selectedFiles.forEach((file, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'preview-item';
    wrap.innerHTML = `
      <img src="${URL.createObjectURL(file)}" alt="" />
      <button class="preview-remove" data-idx="${idx}" title="Xóa ảnh này">×</button>
    `;
    previewList.appendChild(wrap);
  });

  previewList.querySelectorAll('.preview-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      selectedFiles.splice(idx, 1);
      renderPreview();
    });
  });
}

document.getElementById('btn-clear-all-preview').addEventListener('click', () => {
  if (!confirm('Xóa toàn bộ ảnh đã chọn?')) return;
  selectedFiles = [];
  renderPreview();
});

// Upload
btnUpload.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;

  const form = new FormData();
  selectedFiles.forEach(f => form.append('photos', f));
  form.append('dateGroup', document.getElementById('date-group').value);

  const progress = document.getElementById('upload-progress');
  const status = document.getElementById('upload-status');
  progress.style.display = 'block';
  status.textContent = `Đang tải ${selectedFiles.length} ảnh lên...`;
  btnUpload.disabled = true;

  try {
    const res = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: { 'x-admin-password': adminPassword },
      body: form
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi upload');

    status.textContent = `✅ Đã đăng thành công ${data.count} ảnh!`;
    selectedFiles = [];
    renderPreview();
    loadManage();
    setTimeout(() => { progress.style.display = 'none'; }, 2000);
  } catch (err) {
    status.textContent = '❌ ' + err.message;
    btnUpload.disabled = false;
  }
});

// ========== DRIVE (kiểm tra link hợp lệ) ==========
function isValidDriveLink(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    // Cho phép drive.google.com, docs.google.com
    return (
      host === 'drive.google.com' ||
      host === 'docs.google.com' ||
      host.endsWith('.google.com') && (url.includes('/drive/') || url.includes('/file/') || url.includes('/folders/'))
    );
  } catch {
    return false;
  }
}

async function loadDrive() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    document.getElementById('drive-link-input').value = data.driveLink || '';
  } catch {}
}

document.getElementById('btn-save-drive').addEventListener('click', async () => {
  const link = document.getElementById('drive-link-input').value.trim();
  const status = document.getElementById('drive-status');

  if (link && !isValidDriveLink(link)) {
    status.textContent = '❌ Link không hợp lệ. Phải là link Google Drive (drive.google.com hoặc docs.google.com)';
    status.style.color = '#f87171';
    return;
  }

  try {
    const res = await fetch('/api/admin/drive-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword
      },
      body: JSON.stringify({ link })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    status.textContent = link ? '✅ Đã lưu link Google Drive' : '✅ Đã xóa link';
    status.style.color = '#34d399';
  } catch (err) {
    status.textContent = '❌ ' + err.message;
    status.style.color = '#f87171';
  }
});

document.getElementById('btn-delete-drive').addEventListener('click', async () => {
  if (!confirm('Xóa link Google Drive? (xóa vĩnh viễn)')) return;
  const status = document.getElementById('drive-status');
  try {
    const res = await fetch('/api/admin/drive-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword
      },
      body: JSON.stringify({ link: '' })
    });
    if (!res.ok) throw new Error('Lỗi');
    document.getElementById('drive-link-input').value = '';
    status.textContent = '✅ Đã xóa link Google Drive';
    status.style.color = '#34d399';
  } catch (err) {
    status.textContent = '❌ ' + err.message;
    status.style.color = '#f87171';
  }
});

// Notes
async function loadNotes() {
  try {
    const res = await fetch('/api/admin/notes', {
      headers: { 'x-admin-password': adminPassword }
    });
    const notes = await res.json();
    const list = document.getElementById('notes-list');
    list.innerHTML = '';

    if (notes.length === 0) {
      list.innerHTML = '<p style="color:#666;margin-top:12px">Chưa có thông tin nào.</p>';
      return;
    }

    notes.forEach(note => {
      const div = document.createElement('div');
      div.className = 'upload-box';
      div.style.marginBottom = '12px';
      div.style.padding = '14px';
      div.innerHTML = `
        <p style="white-space:pre-wrap;margin-bottom:10px">${escapeHtml(note.content)}</p>
        <small style="color:#64748b">${new Date(note.createdAt).toLocaleString('vi-VN')}</small>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn-restore btn-edit-note" data-id="${note.id}">Sửa</button>
          <button class="btn-delete btn-del-note" data-id="${note.id}">Xóa</button>
        </div>
      `;
      list.appendChild(div);
    });

    list.querySelectorAll('.btn-del-note').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Xóa thông tin này?')) return;
        await fetch(`/api/admin/notes/${btn.dataset.id}`, {
          method: 'DELETE',
          headers: { 'x-admin-password': adminPassword }
        });
        loadNotes();
      });
    });

    list.querySelectorAll('.btn-edit-note').forEach(btn => {
      btn.addEventListener('click', () => {
        const note = notes.find(n => n.id === btn.dataset.id);
        if (!note) return;
        const newContent = prompt('Sửa nội dung:', note.content);
        if (newContent === null) return;
        fetch(`/api/admin/notes/${note.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-password': adminPassword
          },
          body: JSON.stringify({ content: newContent })
        }).then(() => loadNotes());
      });
    });
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('btn-add-note').addEventListener('click', async () => {
  const content = document.getElementById('note-content').value.trim();
  if (!content) return alert('Nhập nội dung');
  try {
    const res = await fetch('/api/admin/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword
      },
      body: JSON.stringify({ content })
    });
    if (!res.ok) throw new Error('Lỗi');
    document.getElementById('note-content').value = '';
    loadNotes();
  } catch (err) {
    alert('Lỗi đăng thông tin');
  }
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Title
async function loadTitleInfo() {
  try {
    const res = await fetch('/api/admin/info', {
      headers: { 'x-admin-password': adminPassword }
    });
    const data = await res.json();
    document.getElementById('current-title').value = data.title || 'Album Ảnh';
    const status = document.getElementById('title-status');
    if (!data.canChangeTitle) {
      status.textContent = `Chỉ được đổi tên 1 lần / 7 ngày. Còn khoảng ${data.remainDays} ngày.`;
      status.style.color = '#fbbf24';
      document.getElementById('btn-change-title').disabled = true;
    } else {
      status.textContent = '';
      document.getElementById('btn-change-title').disabled = false;
    }
  } catch {}
}

document.getElementById('btn-change-title').addEventListener('click', async () => {
  const title = document.getElementById('new-title').value.trim();
  const password = document.getElementById('title-password').value;
  const status = document.getElementById('title-status');

  if (!title) return alert('Nhập tên mới');
  if (!password) return alert('Nhập mật khẩu admin');

  try {
    const res = await fetch('/api/admin/title', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword
      },
      body: JSON.stringify({ title, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi');

    status.textContent = '✅ Đã đổi tên trang thành công!';
    status.style.color = '#34d399';
    document.getElementById('current-title').value = data.title;
    document.getElementById('new-title').value = '';
    document.getElementById('title-password').value = '';
    loadTitleInfo();
  } catch (err) {
    status.textContent = '❌ ' + err.message;
    status.style.color = '#f87171';
  }
});

// Manage photos
async function loadManage() {
  try {
    const res = await fetch('/api/admin/photos', {
      headers: { 'x-admin-password': adminPassword }
    });
    if (res.status === 401) {
      alert('Sai mật khẩu, đăng nhập lại');
      sessionStorage.removeItem('adminPassword');
      location.reload();
      return;
    }
    const photos = await res.json();
    const active = photos.filter(p => !p.deletedAt);
    currentActivePhotos = active;

    const groups = {};
    active.forEach(p => {
      const g = p.dateGroup || 'Không rõ';
      groups[g] = (groups[g] || 0) + 1;
    });

    const groupEl = document.getElementById('date-groups');
    groupEl.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'date-group-btn' + (currentManageGroup === 'all' ? ' active' : '');
    allBtn.dataset.group = 'all';
    allBtn.textContent = `Tất cả (${active.length})`;
    groupEl.appendChild(allBtn);

    Object.keys(groups).sort().reverse().forEach(g => {
      const btn = document.createElement('button');
      btn.className = 'date-group-btn' + (currentManageGroup === g ? ' active' : '');
      btn.dataset.group = g;
      btn.innerHTML = `${g} (${groups[g]}) <span class="btn-del-date" data-date="${g}" title="Xóa toàn bộ ngày này" style="margin-left:6px;color:#fca5a5;cursor:pointer">✕</span>`;
      groupEl.appendChild(btn);
    });

    groupEl.querySelectorAll('.date-group-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-del-date')) return;
        groupEl.querySelectorAll('.date-group-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentManageGroup = btn.dataset.group;
        const filtered = currentManageGroup === 'all' ? active : active.filter(p => p.dateGroup === currentManageGroup);
        renderManage(filtered, 'manage-gallery');
      });
    });

    groupEl.querySelectorAll('.btn-del-date').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const date = btn.dataset.date;
        if (!confirm(`Xóa toàn bộ ảnh ngày ${date}? (chuyển vào thùng rác)`)) return;
        await fetch('/api/admin/photos/delete-all', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-password': adminPassword
          },
          body: JSON.stringify({ dateGroup: date })
        });
        currentManageGroup = 'all';
        loadManage();
        loadTrash();
      });
    });

    const filtered = currentManageGroup === 'all' ? active : active.filter(p => p.dateGroup === currentManageGroup);
    renderManage(filtered, 'manage-gallery');
  } catch (err) {
    console.error(err);
  }
}

function renderManage(photos, containerId) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  if (photos.length === 0) {
    el.innerHTML = '<p style="color:#666">Không có ảnh.</p>';
    return;
  }

  photos.forEach(photo => {
    const card = document.createElement('div');
    card.className = 'manage-card';
    const isTrash = !!photo.deletedAt;

    card.innerHTML = `
      <img src="/uploads/compressed/${photo.filename}" alt="" loading="lazy" />
      <div class="info">${photo.dateGroup || ''} · ${photo.likes || 0} ♥</div>
      <div class="actions">
        ${isTrash
          ? `<button class="btn-restore" data-id="${photo.id}">Khôi phục</button>
             <button class="btn-permanent" data-id="${photo.id}">Xóa vĩnh viễn</button>`
          : `<button class="btn-delete" data-id="${photo.id}">Xóa</button>`
        }
      </div>
    `;
    el.appendChild(card);
  });

  el.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => softDelete(btn.dataset.id));
  });
  el.querySelectorAll('.btn-restore').forEach(btn => {
    btn.addEventListener('click', () => restore(btn.dataset.id));
  });
  el.querySelectorAll('.btn-permanent').forEach(btn => {
    btn.addEventListener('click', () => permanentDelete(btn.dataset.id));
  });
}

async function softDelete(id) {
  if (!confirm('Chuyển ảnh vào thùng rác? (có thể khôi phục trong 7 ngày)')) return;
  await fetch(`/api/admin/photos/${id}/delete`, {
    method: 'POST',
    headers: { 'x-admin-password': adminPassword }
  });
  loadManage();
  loadTrash();
}

async function restore(id) {
  await fetch(`/api/admin/photos/${id}/restore`, {
    method: 'POST',
    headers: { 'x-admin-password': adminPassword }
  });
  loadManage();
  loadTrash();
}

async function permanentDelete(id) {
  if (!confirm('Xóa vĩnh viễn? Không thể khôi phục!')) return;
  await fetch(`/api/admin/photos/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-password': adminPassword }
  });
  loadTrash();
  loadManage();
}

document.getElementById('btn-delete-all-active').addEventListener('click', async () => {
  const msg = currentManageGroup === 'all'
    ? 'Xóa TOÀN BỘ ảnh đang có? (chuyển vào thùng rác)'
    : `Xóa toàn bộ ảnh ngày ${currentManageGroup}? (chuyển vào thùng rác)`;
  if (!confirm(msg)) return;

  await fetch('/api/admin/photos/delete-all', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-password': adminPassword
    },
    body: JSON.stringify({ dateGroup: currentManageGroup === 'all' ? null : currentManageGroup })
  });
  currentManageGroup = 'all';
  loadManage();
  loadTrash();
});

document.getElementById('btn-delete-all-trash').addEventListener('click', async () => {
  if (!confirm('Xóa VĨNH VIỄN toàn bộ ảnh trong thùng rác? Không thể khôi phục!')) return;
  await fetch('/api/admin/photos/purge-trash', {
    method: 'POST',
    headers: { 'x-admin-password': adminPassword }
  });
  loadTrash();
  loadManage();
});

async function loadTrash() {
  try {
    const res = await fetch('/api/admin/photos', {
      headers: { 'x-admin-password': adminPassword }
    });
    const photos = await res.json();
    const deleted = photos.filter(p => p.deletedAt);
    renderManage(deleted, 'trash-gallery');
  } catch {}
}
