'use client'

import { useEffect, useRef } from 'react'

const useScrollReveal = (options = {}) => {
  const ref = useRef(null)
  const transform = options.transform || 'translateY(20px)'

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Only apply reveal animation if element actually exists
    // Set initial state
    element.style.opacity = '0'
    element.style.transform = transform
    element.style.transition = 'opacity 0.5s ease, transform 0.5s ease'

    const showElement = () => {
      element.style.opacity = '1'
      element.style.transform = 'translateY(0px)'
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          showElement()
          observer.unobserve(element)
        }
      },
      {
        threshold: 0.01,
        rootMargin: '50px 0px 50px 0px'
      }
    )

    // Wait for layout then check
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!element) return
        
        // Check if already in viewport
        const rect = element.getBoundingClientRect()
        if (rect.top < window.innerHeight + 100 && rect.bottom > -100) {
          showElement()
          return
        }
        
        observer.observe(element)
      })
    })

    // Hard fallback after 600ms — force show everything
    const fallback = setTimeout(showElement, 600)

    
    return () => {
      clearTimeout(fallback)
      observer.disconnect()
    }
  }, [transform])

  return ref
}

export default useScrollReveal
