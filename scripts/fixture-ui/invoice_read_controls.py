"""Closed controls for the five saved fictional invoice read fixtures."""
import re

def read_control(label,record):
    assert re.fullmatch(r'IRP0[1-5]',record), 'Only recorded invoice regression fixtures allowed'
    assert label in {'Overview tab','Breakdown tab','View GRN '+record}, 'Invoice read action refused'
    return label

def visible_bounds(node):
    m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',node.get('bounds',''));assert m
    x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
    return x,y,xx,yy

def financial_row(tree,label,value):
    assert label in {'Total Amount','Tax Amount'} and isinstance(value,int) and 0<=value<=1000
    rows=[n for n in tree.iter('node') if n.get('text')==label];assert len(rows)==1
    x,y,xx,yy=visible_bounds(rows[0]);matches=[]
    for node in tree.iter('node'):
        if node.get('text')!='₹'+str(value):continue
        try:a,b,aa,bb=visible_bounds(node)
        except AssertionError:continue
        if a>=xx and abs((b+bb)-(y+yy))<=24:matches.append(node)
    assert len(matches)==1,'Exact visible financial row value required'
