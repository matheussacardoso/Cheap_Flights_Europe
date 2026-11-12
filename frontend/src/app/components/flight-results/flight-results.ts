import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FlightService, FlightResponse } from '../../services/flight';

@Component({
  selector: 'app-flight-results',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './flight-results.html',
  styleUrl: './flight-results.css',
})
export class FlightResultsComponent implements OnInit {
  flights: FlightResponse[] = [];

  constructor(private flightService: FlightService) {}

  ngOnInit(): void {
    this.flights = this.flightService.searchResults;
  }
}
