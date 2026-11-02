import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    localStorage.clear();
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('saves a normalized web address in local storage', () => {
    component.formName = 'Documentazione';
    component.formUrl = 'example.com/docs';

    component.saveLink();

    expect(component.links).toHaveLength(1);
    expect(component.links[0].url).toBe('https://example.com/docs');
    expect(JSON.parse(localStorage.getItem('linkboard.links') ?? '[]')).toHaveLength(1);
  });

  it('rejects non-web protocols', () => {
    component.formUrl = 'javascript://alert(1)';

    component.saveLink();

    expect(component.links).toHaveLength(0);
    expect(component.formError).toContain('http e https');
  });

  it('filters links by name and hostname', () => {
    component.formName = 'Documentazione';
    component.formUrl = 'example.com';
    component.saveLink();
    component.searchTerm = 'example';

    expect(component.filteredLinks).toHaveLength(1);
    component.searchTerm = 'nessun risultato';
    expect(component.filteredLinks).toHaveLength(0);
  });
});
