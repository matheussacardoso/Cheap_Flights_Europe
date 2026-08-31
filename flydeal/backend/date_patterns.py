from datetime import datetime, timedelta
from typing import List, Tuple

DAYS_MAP = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6
}

def generate_date_pairs(date_from_str: str, date_to_str: str, depart_day: str, return_day: str) -> List[Tuple[str, str]]:
    """Generates all outbound and inbound date pairs within a range matching the given day pattern."""
    start_date = datetime.strptime(date_from_str, "%Y-%m-%d").date()
    end_date = datetime.strptime(date_to_str, "%Y-%m-%d").date()

    target_depart = DAYS_MAP[depart_day.lower()]
    target_return = DAYS_MAP[return_day.lower()]

    pairs = []
    current = start_date

    while current <= end_date:
        if current.weekday() == target_depart:
            # Calculate corresponding return date
            days_ahead = (target_return - target_depart) % 7
            if days_ahead == 0:
                days_ahead = 7  # Must be a future day, not same-day
            
            return_date = current + timedelta(days=days_ahead)
            
            if return_date <= end_date:
                pairs.append((current.strftime("%Y-%m-%d"), return_date.strftime("%Y-%m-%d")))
            
        current += timedelta(days=1)

    return pairs