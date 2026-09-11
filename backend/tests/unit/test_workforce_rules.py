"""
Workforce rules — pure-function pins for the backend authority (Phase 4–6).

The frontend `workforce/attendanceService.js` + `leaveService.js` apply the
same semantics for instant UI feedback; the SERVER decides. These tests pin
the shared semantics so the two can never drift silently, and prove the
hardening guarantees (no duplicate-day punch semantics, no self-review,
no illegal transitions, bounded leave windows, honest clock parsing).
"""

import unittest
from datetime import date, datetime

from app.services.employee import workforce_rules as rules


class AttendanceTimingTests(unittest.TestCase):
    def setUp(self):
        self.settings = rules.resolve_settings(None)
        self.day = date(2026, 9, 11)  # Friday

    def test_defaults_match_the_documented_store_hours(self):
        self.assertEqual(self.settings["workingStartTime"], "09:30")
        self.assertEqual(self.settings["workingEndTime"], "18:30")
        self.assertEqual(self.settings["lateThresholdMinutes"], 10)
        self.assertEqual(self.settings["minimumHalfDayMinutes"], 240)
        self.assertEqual(self.settings["fullDayMinutes"], 540)

    def test_start_time_aliases_from_the_settings_surface(self):
        merged = rules.resolve_settings({"startTime": "10:00", "endTime": "19:00"})
        self.assertEqual(merged["workingStartTime"], "10:00")
        self.assertEqual(merged["workingEndTime"], "19:00")

    def test_within_threshold_is_present_beyond_is_late(self):
        on_time = rules.evaluate_timing(
            self.day, datetime(2026, 9, 11, 9, 40), datetime(2026, 9, 11, 18, 30), self.settings
        )
        self.assertEqual(on_time["lateMinutes"], 0)
        late = rules.evaluate_timing(
            self.day, datetime(2026, 9, 11, 9, 45), datetime(2026, 9, 11, 18, 30), self.settings
        )
        self.assertEqual(late["lateMinutes"], 15)  # counted from 09:30, like the frontend
        status = rules.status_after_punch(
            self.day, datetime(2026, 9, 11, 9, 45), datetime(2026, 9, 11, 18, 30), self.settings
        )
        self.assertEqual(status, "LATE")

    def test_short_shift_is_half_day_even_when_ontime(self):
        status = rules.status_after_punch(
            self.day, datetime(2026, 9, 11, 9, 0), datetime(2026, 9, 11, 12, 59), self.settings
        )
        self.assertEqual(status, "HALF_DAY")

    def test_exactly_minimum_minutes_is_full_day(self):
        status = rules.status_after_punch(
            self.day, datetime(2026, 9, 11, 9, 0), datetime(2026, 9, 11, 13, 0), self.settings
        )
        self.assertEqual(status, "PRESENT")

    def test_early_leave_is_measured_from_closing_time(self):
        timing = rules.evaluate_timing(
            self.day, datetime(2026, 9, 11, 9, 0), datetime(2026, 9, 11, 18, 0), self.settings
        )
        self.assertEqual(timing["earlyLeaveMinutes"], 30)

    def test_leave_flag_wins_over_the_calendar(self):
        holiday = date(2026, 8, 15)
        settings = rules.resolve_settings({"holidays": [{"date": "2026-08-15", "name": "Independence Day", "active": True}]})
        self.assertEqual(rules.calendar_status(holiday, settings), "HOLIDAY")
        self.assertEqual(rules.status_after_punch(holiday, None, None, settings, on_leave=True), "LEAVE")
        # Working on a holiday is ON_DUTY, never counted late:
        self.assertEqual(
            rules.status_after_punch(holiday, datetime(2026, 8, 15, 12, 0), None, settings), "ON_DUTY"
        )

    def test_week_off_uses_js_day_numbering(self):
        # Sunday 2026-09-13 with weekOffWeekdays=[0] (JS getUTCDay numbering)
        self.assertEqual(
            rules.calendar_status(date(2026, 9, 13), rules.resolve_settings({"weekOffWeekdays": [0]})),
            "WEEK_OFF",
        )

    def test_punch_clock_accepts_utc_and_store_wallclock(self):
        self.assertEqual(rules.to_store_wallclock("2026-09-11T04:15:00Z"), datetime(2026, 9, 11, 9, 45))
        self.assertEqual(rules.to_store_wallclock("2026-09-11 09:45:00"), datetime(2026, 9, 11, 9, 45))
        with self.assertRaises(ValueError):
            rules.to_store_wallclock("not-a-date")


class LeaveRuleTests(unittest.TestCase):
    def test_inclusive_day_count_and_overlap_boundaries(self):
        self.assertEqual(rules.inclusive_day_count(date(2026, 9, 1), date(2026, 9, 1)), 1)
        self.assertEqual(rules.inclusive_day_count(date(2026, 9, 1), date(2026, 9, 5)), 5)
        self.assertTrue(rules.ranges_overlap(date(2026, 9, 1), date(2026, 9, 5), date(2026, 9, 5), date(2026, 9, 9)))
        self.assertFalse(rules.ranges_overlap(date(2026, 9, 1), date(2026, 9, 4), date(2026, 9, 5), date(2026, 9, 9)))

    def test_only_legal_transitions(self):
        rules.validate_leave_transition("PENDING", "APPROVED")
        rules.validate_leave_transition("PENDING", "REJECTED")
        rules.validate_leave_transition("PENDING", "CANCELLED")
        rules.validate_leave_transition("APPROVED", "CANCELLED")
        for current, target in [
            ("APPROVED", "REJECTED"),
            ("REJECTED", "APPROVED"),
            ("REJECTED", "CANCELLED"),
            ("CANCELLED", "APPROVED"),
        ]:
            with self.assertRaises(ValueError):
                rules.validate_leave_transition(current, target)

    def test_idempotent_redecision_is_recognised(self):
        self.assertTrue(rules.is_idempotent_decision("APPROVED", "APPROVED"))
        self.assertFalse(rules.is_idempotent_decision("PENDING", "APPROVED"))

    def test_rejection_requires_a_reason(self):
        rules.validate_review_note("APPROVED", None)
        with self.assertRaises(ValueError):
            rules.validate_review_note("REJECTED", "   ")

    def test_leave_types_statuses(self):
        self.assertEqual(
            rules.LEAVE_TYPES, {"CASUAL", "SICK", "EARNED", "EMERGENCY", "OTHER"}
        )
        self.assertEqual(
            rules.LEAVE_STATUSES, {"PENDING", "APPROVED", "REJECTED", "CANCELLED"}
        )


class PerformanceRuleTests(unittest.TestCase):
    def test_rating_scale(self):
        for bad in (0, 6, "x", None):
            with self.assertRaises(ValueError):
                rules.validate_rating(bad)
        self.assertEqual(rules.validate_rating("3"), 3)

    def test_summary_average_and_latest(self):
        rows = [
            {"rating": 4, "reviewPeriod": "MONTHLY", "reviewDate": "2026-08-01"},
            {"rating": 5, "reviewPeriod": "ANNUAL", "reviewDate": "2026-01-10"},
        ]
        summary = rules.performance_summary(rows)
        self.assertEqual(summary["reviews"], 2)
        self.assertEqual(summary["averageRating"], 4.5)
        self.assertEqual(summary["latestPeriod"], "MONTHLY")
        self.assertIsNone(rules.performance_summary([])["averageRating"])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
