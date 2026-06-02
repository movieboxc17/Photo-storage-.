(() => {
  const fileInput = document.querySelector('#photos');
  const dropzone = document.querySelector('.dropzone');
  const preview = document.querySelector('#preview');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      fileInput.files = e.dataTransfer.files;
      renderPreviews();
    });

    fileInput.addEventListener('change', renderPreviews);
  }

  function renderPreviews() {
    if (!preview || !fileInput.files?.length) return;
    preview.innerHTML = '';

    Array.from(fileInput.files).slice(0, 50).forEach((file) => {
      const wrapper = document.createElement('div');
      const img = document.createElement('img');
      img.alt = file.name;
      img.loading = 'lazy';
      img.src = URL.createObjectURL(file);
      wrapper.appendChild(img);
      preview.appendChild(wrapper);
    });
  }
})();
