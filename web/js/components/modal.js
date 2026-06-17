export class Modal {
  constructor(options = {}) {
    this.title = options.title || '';
    this.content = options.content || '';
    this.showConfirm = options.showConfirm !== false;
    this.showCancel = options.showCancel !== false;
    this.confirmText = options.confirmText || '确认';
    this.cancelText = options.cancelText || '取消';
    this.onConfirm = options.onConfirm || (() => {});
    this.onCancel = options.onCancel || (() => {});
    this.element = null;
  }

  show() {
    if (this.element) return;

    this.element = document.createElement('div');
    this.element.className = 'modal-overlay';
    this.element.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">${this.title}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">${this.content}</div>
        <div class="modal-footer">
          ${this.showCancel ? `<button class="btn btn-secondary modal-cancel">${this.cancelText}</button>` : ''}
          ${this.showConfirm ? `<button class="btn btn-primary modal-confirm">${this.confirmText}</button>` : ''}
        </div>
      </div>
    `;

    this.element.querySelector('.modal-close')?.addEventListener('click', () => this.hide());
    this.element.querySelector('.modal-cancel')?.addEventListener('click', () => {
      this.onCancel();
      this.hide();
    });
    this.element.querySelector('.modal-confirm')?.addEventListener('click', () => {
      this.onConfirm();
      this.hide();
    });

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.hide();
    });

    document.body.appendChild(this.element);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      this.element.classList.add('modal-visible');
    });
  }

  hide() {
    if (!this.element) return;
    this.element.classList.remove('modal-visible');
    setTimeout(() => {
      this.element?.remove();
      this.element = null;
      document.body.style.overflow = '';
    }, 300);
  }

  static confirm(options) {
    return new Promise((resolve) => {
      const modal = new Modal({
        ...options,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
      modal.show();
    });
  }
}
