const STORAGE_KEY = 'azadiwire_bookmarks';

function getBookmarks(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveBookmarks(slugs: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
}

function isBookmarked(slug: string): boolean {
  return getBookmarks().includes(slug);
}

function toggleBookmark(slug: string): boolean {
  const bookmarks = getBookmarks();
  const idx = bookmarks.indexOf(slug);
  if (idx === -1) {
    bookmarks.unshift(slug);
    saveBookmarks(bookmarks);
    return true;
  }
  bookmarks.splice(idx, 1);
  saveBookmarks(bookmarks);
  return false;
}

function initBookmarkButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('.bookmark-btn').forEach((btn) => {
    const slug = btn.dataset.slug;
    if (!slug) return;

    if (isBookmarked(slug)) btn.classList.add('active');

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const active = toggleBookmark(slug);
      btn.classList.toggle('active', active);
      btn.title = active ? 'Remove bookmark' : 'Bookmark';
    });
  });
}

document.addEventListener('astro:page-load', initBookmarkButtons);
if (document.readyState !== 'loading') {
  initBookmarkButtons();
} else {
  document.addEventListener('DOMContentLoaded', initBookmarkButtons);
}

export { getBookmarks, isBookmarked, toggleBookmark };
