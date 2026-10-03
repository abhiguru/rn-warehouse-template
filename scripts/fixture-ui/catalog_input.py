"""Bounded fictional catalog entry: observe each character; never resend it."""
import time


def enter_catalog_record(value, current, send, clock=time.monotonic, pause=time.sleep):
    assert value in {'FXC701', 'FXC702'}, 'Reserved fictional catalog record required'
    # The caller must clear and focus the unique stock-search field first.
    def settled(expected):
        end = clock() + 5
        while clock() < end:
            if current() == expected:
                return
            pause(.2)
        raise AssertionError('Native stock input mismatch; no text replay')
    settled('')
    prefix = ''
    for char in value:
        send(char)
        prefix += char
        settled(prefix)
