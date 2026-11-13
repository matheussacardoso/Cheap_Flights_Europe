import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** The app's top bar: brand and the two pages. */
@Component({
  selector: 'app-nav-bar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.css',
})
export class NavBarComponent {}
