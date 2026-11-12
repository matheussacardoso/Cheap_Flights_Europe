import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router'; // <-- 1. Importe o Router
import { FlightService } from '../../services/flight';

@Component({
  selector: 'app-flight-search',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './flight-search.html',
  styleUrl: './flight-search.css'
})
export class FlightSearchComponent {
  searchForm: FormGroup;
  loading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private flightService: FlightService,
    private router: Router // <-- 2. Injete o Router no construtor
  ) {
    this.searchForm = this.fb.group({
      origin: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
      destination: ['', [Validators.minLength(3), Validators.maxLength(3)]],
      date_from: ['', Validators.required],
      date_to: [''],
      currency: ['EUR']
    });
  }

  onSearch(): void {
    if (this.searchForm.invalid) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.flightService.searchFlights(this.searchForm.value).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/results']); // <-- 3. Redireciona para a página de resultados
      },
      error: (err) => {
        this.errorMessage = 'Erro ao buscar voos. Verifique se o back-end está ativo.';
        this.loading = false;
      }
    });
  }
}