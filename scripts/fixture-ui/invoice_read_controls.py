"""Closed controls for the five saved fictional invoice read fixtures."""
import re

def read_control(label,record):
    assert re.fullmatch(r'IRP0[1-5]',record), 'Only recorded invoice regression fixtures allowed'
    assert label in {'Overview tab','Breakdown tab','View GRN '+record}, 'Invoice read action refused'
    return label
