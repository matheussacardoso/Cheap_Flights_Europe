import { TestBed } from '@angular/core/testing';
import { LoadingIndicatorComponent } from './loading-indicator';

describe('LoadingIndicatorComponent', () => {
  async function render(inputs: Record<string, unknown>): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(LoadingIndicatorComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  it('announces what is running, with details and a progress bar', async () => {
    const element = await render({
      title: 'Finding the cheapest dates',
      detail: 'Comparing 9 trips.',
    });

    const status = element.querySelector('[role="status"]')!;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('Finding the cheapest dates');
    expect(status.textContent).toContain('Comparing 9 trips.');
    expect(element.querySelector('.bar')).not.toBeNull();
  });

  it('is a single line when compact', async () => {
    const element = await render({ title: 'Loading airports…', detail: 'hidden', compact: true });

    expect(element.classList).toContain('is-compact');
    expect(element.textContent).not.toContain('hidden');
    expect(element.querySelector('.bar')).toBeNull();
  });
});
