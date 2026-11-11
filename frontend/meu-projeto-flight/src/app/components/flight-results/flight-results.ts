import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FlightService, FlightResponse } from '../../services/flight';

@Component({
  selector: 'app-flight-results',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './flight-results.html',
  styleUrl: './flight-results.css'
})
export class FlightResultsComponent implements OnInit {
  flights: FlightResponse[] = [];

  constructor(
    private flightService: FlightService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.flights = this.flightService.searchResults;
  }
}