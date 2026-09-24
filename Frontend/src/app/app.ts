import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { I18nService } from './core/ui/localization/i18n.service';
import { ThemeService } from './core/ui/theme/theme.service';
import { MissingBlockReconciliationService } from './core/editor/structure/missing-block-reconciliation.service';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly i18n = inject(I18nService);
  private readonly theme = inject(ThemeService);
  private readonly missingBlockReconciliation = inject(MissingBlockReconciliationService);
  protected readonly title = signal('MinecraftBuilder');
}
