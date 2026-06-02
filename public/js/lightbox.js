(() => {
  const images = Array.from(document.querySelectorAll('.gallery img'));
  const lightbox = document.querySelector('#lightbox');
  const lightboxImage = document.querySelector('#lightbox-image');
  const closeBtn = document.querySelector('#close-lightbox');
  const prevBtn = document.querySelector('#prev-photo');
  const nextBtn = document.querySelector('#next-photo');
  const counter = document.querySelector('#lightbox-counter');

  if (!images.length || !lightbox) return;

  let index = 0;

  function show(i) {
    index = (i + images.length) % images.length;
    const image = images[index];
    lightboxImage.src = image.dataset.full || image.src;
    counter.textContent = `${index + 1} / ${images.length}`;
  }

  images.forEach((img, idx) => {
    img.addEventListener('click', () => {
      lightbox.hidden = false;
      show(idx);
    });
  });

  closeBtn?.addEventListener('click', () => { lightbox.hidden = true; });
  prevBtn?.addEventListener('click', () => show(index - 1));
  nextBtn?.addEventListener('click', () => show(index + 1));

  window.addEventListener('keydown', (e) => {
    if (lightbox.hidden) return;
    if (e.key === 'Escape') lightbox.hidden = true;
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });
})();
