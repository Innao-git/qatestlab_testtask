import type { Page } from '@playwright/test';
import { SideMenu } from './components/SideMenu';
import { Toast } from './components/Toast';
import { TopBar } from './components/TopBar';

export abstract class BasePage {
  readonly sideMenu: SideMenu;
  readonly topBar: TopBar;
  readonly toast: Toast;

  constructor(protected readonly page: Page) {
    this.sideMenu = new SideMenu(page);
    this.topBar = new TopBar(page);
    this.toast = new Toast(page);
  }
}
