import { HarnessLoader, TestKey } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { Airport } from '../../services/network-http-client';
import { airport } from '../../testing/network-fixtures';
import { AirportSearch, SearchOption, airportOption, countryOption } from './airport-search';

const MALAGA: Airport = { ...airport('AGP', 'ES', 'Spain'), name: 'Málaga', city: 'Málaga' };
const MADRID: Airport = { ...airport('MAD', 'ES', 'Spain'), name: 'Madrid', city: 'Madrid' };
const PORTO: Airport = { ...airport('OPO', 'PT', 'Portugal'), name: 'Porto', city: 'Porto' };

const OPTIONS: SearchOption[] = [
  countryOption({ code: 'ES', name: 'Spain', airports: [MALAGA, MADRID] }),
  ...[MADRID, MALAGA, PORTO].map(airportOption),
];

describe('AirportSearch', () => {
  let fixture: ComponentFixture<AirportSearch>;
  let loader: HarnessLoader;
  let box: MatAutocompleteHarness;
  let chosen: SearchOption[];
  let cleared: number;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AirportSearch] }).compileComponents();
    fixture = TestBed.createComponent(AirportSearch);
    fixture.componentRef.setInput('label', 'To');
    fixture.componentRef.setInput('options', OPTIONS);
    chosen = [];
    cleared = 0;
    fixture.componentInstance.chosen.subscribe((option) => chosen.push(option));
    fixture.componentInstance.cleared.subscribe(() => cleared++);
    await fixture.whenStable();
    loader = TestbedHarnessEnvironment.loader(fixture);
    box = await loader.getHarness(MatAutocompleteHarness);
  });

  /** The bold names of the listed options (the popup lives in an overlay, outside the fixture). */
  async function titles(): Promise<string[]> {
    await box.getOptions(); // waits for the list to render
    return [...document.querySelectorAll('mat-option')].map(
      (option) => (option.querySelector('.title') ?? option).textContent?.trim() ?? '',
    );
  }

  it('is labelled and starts closed', async () => {
    expect(fixture.nativeElement.querySelector('mat-label').textContent).toBe('To');
    expect(await box.isOpen()).toBe(false);
  });

  it('matches without accents and puts names that start with the query first', async () => {
    await box.enterText('ma');
    expect(await box.isOpen()).toBe(true);
    expect(await titles()).toEqual(['Madrid', 'Málaga']);

    await box.clear();
    await box.enterText('malaga');
    expect(await titles()).toEqual(['Málaga']);
  });

  it('matches airport codes and countries', async () => {
    await box.enterText('opo');
    expect(await titles()).toEqual(['Porto']);

    await box.clear();
    await box.enterText('spain');
    expect((await titles())[0]).toBe('Any airport in Spain');
  });

  it('chooses an option', async () => {
    await box.enterText('ma');
    await box.selectOption({ text: /Málaga/ });
    expect(chosen.map((option) => option.code)).toEqual(['AGP']);
    expect(await box.isOpen()).toBe(false);
  });

  it('says when nothing matches, and shows the chosen value again on Escape', async () => {
    fixture.componentRef.setInput('value', airportOption(PORTO));
    await box.enterText('xyz');
    expect(await titles()).toEqual(['No matching airports']);

    await (await box.host()).sendKeys(TestKey.ESCAPE);
    expect(await box.isOpen()).toBe(false);
    expect(await box.getValue()).toBe('Porto');
    expect(chosen).toEqual([]);
  });

  it('clears the value', async () => {
    fixture.componentRef.setInput('value', airportOption(PORTO));
    await fixture.whenStable();
    const clear = await loader.getHarness(
      MatButtonHarness.with({ selector: '[aria-label="Clear To"]' }),
    );
    await clear.click();
    expect(cleared).toBe(1);
  });
});
