export class Toast {
  static container = null;

  static getContainer() {
    if (!Toast.container) {
      Toast.container = document.createElement('div');
      Toast.container.className = 'toast-container';
      document.body.appendChild(Toast.container);
    }
    return Toast.container;
  }

  static show(message, type = 'info', duration = 3000) {
    const container = Toast.getContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-message">${message}</span>
      <button class="toast-close">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('toast-visible');
    });

    if (duration > 0) {
      setTimeout(() => {
        toast.classList.remove('toast-visible');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    return toast;
  }

  static success(message, duration) {
    return Toast.show(message, 'success', duration);
  }

  static error(message, duration) {
    return Toast.show(message, 'error', duration);
  }

  static warning(message, duration) {
    return Toast.show(message, 'warning', duration);
  }
}
