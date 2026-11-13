import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NavBarComponent } from './nav-bar';

@Component({ imports: [NavBarComponent], template: '<app-nav-bar />' })
class Page {}

describe('NavBarComponent', () => {
  async function linksAt(url: string): Promise<Record<string, string | null>> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Page },
          { path: 'search', component: Page },
          { path: 'search/results', component: Page },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const links = [...harness.routeNativeElement!.querySelectorAll('nav a')];
    return Object.fromEntries(
      links.map((a) => [a.textContent!.trim(), a.getAttribute('aria-current')]),
    );
  }

  it('marks Routes as the current page on the map', async () => {
    expect(await linksAt('/')).toEqual({ Routes: 'page', Search: null });
  });

  it('marks Search as the current page on the search and its results', async () => {
    expect(await linksAt('/search')).toEqual({ Routes: null, Search: 'page' });
    TestBed.resetTestingModule();
    expect(await linksAt('/search/results')).toEqual({ Routes: null, Search: 'page' });
  });
});
