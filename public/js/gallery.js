let allPhotos = [];
let currentIndex = 0;
let likedIds = new Set(JSON.parse(localStorage.getItem('likedPhotos') || '[]'));
let lastUpdate = 0;
let currentView = 'grid';
let zoomLevel = 1;

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();

    if (data.title) {
      document.getElementById('site-title').textContent = '📷 ' + data.title;
      document.title = data.title;
    }

    const el = document.getElementById('drive-link');
    if (data.driveLink) {
      el.href = data.driveLink;
      el.style.display = 'inline-block';
    } else {
      el.style.display = 'none';
    }

    const notesBox = document.getElementById('notes-box');
    if (data.notes && data.notes.length > 0) {
      notesBox.style.display = 'block';
      notesBox.innerHTML = data.notes.map(n => `
        <div class="note-item">
          <div>${escapeHtml(n.content)}</div>
          <div class="note-time">${new Date(n.createdAt).toLocaleString('vi-VN')}</div>
        </div>
      `).join('');
    } else {
      notesBox.style.display = 'none';
      notesBox.innerHTML = '';
    }

    if (data.lastUpdate && data.lastUpdate !== lastUpdate) {
      const isFirst = lastUpdate === 0;
      lastUpdate = data.lastUpdate;
      if (!isFirst) await loadPhotos();
    }
  } catch (err) {
    console.error(err);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadPhotos() {
  try {
    const res = await fetch('/api/photos');
    allPhotos = await res.json();
    applyFilterAndRender();
  } catch (err) {
    console.error(err);
  }
}

function applyFilterAndRender() {
  let photos = [...allPhotos];
  if (currentView === 'liked') {
    photos = photos.filter(p => likedIds.has(p.id));
  }
  renderGalleryGrouped(photos);

  const countText = currentView === 'liked'
    ? `${photos.length} ảnh đã tim`
    : `${photos.length} ảnh`;
  document.getElementById('photo-count').textContent = countText;
  document.getElementById('empty').style.display = photos.length === 0 ? 'block' : 'none';
}

function renderGalleryGrouped(photos) {
  const wrap = document.getElementById('gallery');
  wrap.innerHTML = '';
  if (photos.length === 0) return;

  const groups = {};
  photos.forEach(p => {
    const g = p.dateGroup || 'Không rõ ngày';
    if (!groups[g]) groups[g] = [];
    groups[g].push(p);
  });

  const sortedDates = Object.keys(groups).sort().reverse();
  const flatList = [];
  sortedDates.forEach(date => groups[date].forEach(p => flatList.push(p)));
  window._filteredPhotos = flatList;

  sortedDates.forEach(date => {
    const section = document.createElement('div');
    section.className = 'date-section';

    const header = document.createElement('div');
    header.className = 'date-header';
    header.innerHTML = `
      <span>${formatDate(date)} <span style="color:#64748b;font-weight:400">${groups[date].length} ảnh</span></span>
      <button class="btn-download-date" data-date="${date}" title="Tải toàn bộ ảnh ngày này">↓ Tải ngày này</button>
    `;
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'gallery';

    groups[date].forEach((photo) => {
      const idx = flatList.findIndex(p => p.id === photo.id);
      const card = document.createElement('div');
      card.className = 'photo-card';
      card.dataset.id = photo.id;

      const isLiked = likedIds.has(photo.id);
      card.innerHTML = `
        <img src="/uploads/compressed/${photo.filename}" alt="" loading="lazy" />
        <button class="like-btn ${isLiked ? 'liked' : ''}" data-id="${photo.id}">♥</button>
        <span class="like-count">${photo.likes || 0}</span>
      `;

      card.querySelector('img').addEventListener('click', () => openModal(idx));
      card.querySelector('.like-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLike(photo.id, e.currentTarget);
      });
      grid.appendChild(card);
    });

    section.appendChild(grid);
    wrap.appendChild(section);
  });

  wrap.querySelectorAll('.btn-download-date').forEach(btn => {
    btn.addEventListener('click', () => downloadByDate(btn.dataset.date));
  });
}

function formatDate(dateStr) {
  if (!dateStr || dateStr === 'Không rõ ngày') return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

async function toggleLike(id, btn) {
  const isLiked = likedIds.has(id);
  if (isLiked) {
    likedIds.delete(id);
    btn.classList.remove('liked');
  } else {
    likedIds.add(id);
    btn.classList.add('liked');
  }
  localStorage.setItem('likedPhotos', JSON.stringify([...likedIds]));

  // Cập nhật nút like trong modal nếu đang mở cùng ảnh
  const modalLike = document.getElementById('modal-like');
  const list = window._filteredPhotos || allPhotos;
  const photo = list[currentIndex];
  if (photo && photo.id === id) {
    if (likedIds.has(id)) modalLike.classList.add('liked');
    else modalLike.classList.remove('liked');
  }

  try {
    const res = await fetch(`/api/photos/${id}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ liked: !isLiked })
    });
    const data = await res.json();
    const countEl = btn.parentElement ? btn.parentElement.querySelector('.like-count') : null;
    if (countEl) countEl.textContent = data.likes;
    document.getElementById('modal-likes').textContent = data.likes;
  } catch {}
}

function openModal(index) {
  const list = window._filteredPhotos || allPhotos;
  currentIndex = index;
  const photo = list[index];
  if (!photo) return;

  zoomLevel = 1;
  const img = document.getElementById('modal-img');
  img.style.transform = 'scale(1)';
  img.src = `/uploads/compressed/${photo.filename}`;
  document.getElementById('modal-likes').textContent = photo.likes || 0;

  const likeBtn = document.getElementById('modal-like');
  if (likedIds.has(photo.id)) likeBtn.classList.add('liked');
  else likeBtn.classList.remove('liked');

  document.getElementById('modal').classList.add('open');
}

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('modal').classList.remove('open');
  zoomLevel = 1;
  document.getElementById('modal-img').style.transform = 'scale(1)';
});

document.getElementById('modal-prev').addEventListener('click', () => {
  if (currentIndex > 0) openModal(currentIndex - 1);
});
document.getElementById('modal-next').addEventListener('click', () => {
  const list = window._filteredPhotos || allPhotos;
  if (currentIndex < list.length - 1) openModal(currentIndex + 1);
});

document.getElementById('modal-like').addEventListener('click', () => {
  const list = window._filteredPhotos || allPhotos;
  const photo = list[currentIndex];
  if (!photo) return;
  const btn = document.querySelector(`.like-btn[data-id="${photo.id}"]`);
  toggleLike(photo.id, btn || document.getElementById('modal-like'));
});

document.getElementById('modal-download').addEventListener('click', () => {
  const list = window._filteredPhotos || allPhotos;
  const photo = list[currentIndex];
  if (!photo) return;
  window.location.href = `/api/download/${photo.id}`;
});

// Zoom
document.getElementById('modal-zoom-in').addEventListener('click', () => {
  zoomLevel = Math.min(zoomLevel + 0.25, 3);
  document.getElementById('modal-img').style.transform = `scale(${zoomLevel})`;
});
document.getElementById('modal-zoom-out').addEventListener('click', () => {
  zoomLevel = Math.max(zoomLevel - 0.25, 0.5);
  document.getElementById('modal-img').style.transform = `scale(${zoomLevel})`;
});

document.querySelectorAll('.menu-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.menu-btn[data-view]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    applyFilterAndRender();
  });
});

async function downloadByDate(date) {
  showProgress(`Đang tải ảnh ngày ${formatDate(date)}...`);
  try {
    const res = await fetch(`/api/download-date/${encodeURIComponent(date)}`);
    if (!res.ok) throw new Error('Lỗi tải');
    const blob = await res.blob();
    finishProgress(blob, `album-${date}.zip`);
  } catch (err) {
    errorProgress();
  }
}

document.getElementById('btn-download-all').addEventListener('click', async () => {
  if (allPhotos.length === 0) {
    alert('Chưa có ảnh để tải');
    return;
  }
  showProgress('Đang chuẩn bị tải toàn bộ ảnh...');
  try {
    const res = await fetch('/api/download-all');
    if (!res.ok) throw new Error('Lỗi tải');
    const blob = await res.blob();
    finishProgress(blob, 'album-anh.zip');
  } catch (err) {
    errorProgress();
  }
});

function showProgress(text) {
  const overlay = document.getElementById('progress-overlay');
  const fill = document.getElementById('progress-fill');
  const percent = document.getElementById('progress-percent');
  document.getElementById('progress-text').textContent = text;
  overlay.style.display = 'flex';
  fill.style.width = '0%';
  percent.textContent = '0%';

  window._progressInterval = setInterval(() => {
    let w = parseFloat(fill.style.width) || 0;
    w += Math.random() * 8;
    if (w > 90) w = 90;
    fill.style.width = w + '%';
    percent.textContent = Math.floor(w) + '%';
  }, 200);
}

function finishProgress(blob, filename) {
  clearInterval(window._progressInterval);
  const fill = document.getElementById('progress-fill');
  const percent = document.getElementById('progress-percent');
  fill.style.width = '100%';
  percent.textContent = '100%';
  document.getElementById('progress-text').textContent = 'Hoàn tất! Đang lưu file...';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  setTimeout(() => {
    document.getElementById('progress-overlay').style.display = 'none';
  }, 800);
}

function errorProgress() {
  clearInterval(window._progressInterval);
  document.getElementById('progress-text').textContent = 'Lỗi khi tải. Thử lại sau.';
  setTimeout(() => {
    document.getElementById('progress-overlay').style.display = 'none';
  }, 2000);
}

document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('modal');
  if (!modal.classList.contains('open')) return;
  if (e.key === 'Escape') document.getElementById('modal-close').click();
  if (e.key === 'ArrowLeft') document.getElementById('modal-prev').click();
  if (e.key === 'ArrowRight') document.getElementById('modal-next').click();
  if (e.key === '+' || e.key === '=') document.getElementById('modal-zoom-in').click();
  if (e.key === '-') document.getElementById('modal-zoom-out').click();
});

async function init() {
  await loadSettings();
  await loadPhotos();
  setInterval(loadSettings, 12000);
}
init();
