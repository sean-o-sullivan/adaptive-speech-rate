const FAVICON_ID = "adaptive-speech-rate-favicon";

export class AdaptiveTabFavicon {
  private link: HTMLLinkElement | undefined;

  constructor(private readonly iconUrl: string) {}

  setActive(active: boolean): void {
    if (!active) {
      this.remove();
      return;
    }

    const head = document.head;
    if (head === null) return;
    this.link ??= this.createLink();
    head.append(this.link);
  }

  remove(): void {
    this.link?.remove();
    this.link = undefined;
    document.getElementById(FAVICON_ID)?.remove();
  }

  private createLink(): HTMLLinkElement {
    const link = document.createElement("link");
    link.id = FAVICON_ID;
    link.rel = "icon";
    link.type = "image/png";
    link.sizes = "32x32";
    link.href = this.iconUrl;
    return link;
  }
}
