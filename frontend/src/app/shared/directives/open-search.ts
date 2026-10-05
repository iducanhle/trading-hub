import { Directive, inject } from '@angular/core';
import { SearchService } from '../../core/services/search.service';

/** Opens the search overlay on click, staying on the current route. */
@Directive({
  selector: '[appOpenSearch]',
  host: { '(click)': 'search.open()' },
})
export class OpenSearch {
  protected readonly search = inject(SearchService);
}
