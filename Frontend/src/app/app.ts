import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { I18nService } from './core/ui/i18n.service';
import { ThemeService } from './core/ui/theme.service';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly i18n = inject(I18nService);
  private readonly theme = inject(ThemeService);
  protected readonly title = signal('MinecraftBuilder');
}
