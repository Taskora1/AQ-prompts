'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  Mail,
  Send,
  Users,
} from 'lucide-react';

import Footer from '../components/Footer';
import Header from '../components/Header';
import Breadcrumb from '../components/Breadcrumb';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useToast } from '../hooks/use-toast';
import { SOCIAL_LINKS } from '../lib/site-social';

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xkovrowe';
const contactEmail = 'hello@aqprompts.com';
const siteUrl = 'https://aqprompts.com';
const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHJ4PSIxMCIgZmlsbD0iIzExMTExOCIvPjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcng9IjEwIiBmaWxsPSIjZmY2YjM1IiBvcGFjaXR5PSIuMTgiLz48L3N2Zz4=';

const contactReasons = [
  { emoji: '📝', title: 'Prompt Request', description: 'Ask us to create prompts for a new style, niche, platform, or category.' },
  { emoji: '🐛', title: 'Report Issue', description: 'Tell us about a broken prompt, incorrect detail, typo, or page problem.' },
  { emoji: '💡', title: 'Feature Suggestion', description: 'Share ideas that would make AQPrompts easier and more useful for creators.' },
  { emoji: '🤝', title: 'Collaboration', description: 'Reach out for partnerships, creator collaborations, or content projects.' },
  { emoji: '💬', title: 'General Question', description: 'Ask anything about our prompts, supported AI tools, or how to use the site.' },
];

contactReasons.splice(contactReasons.length - 1, 0, {
  emoji: '\uD83D\uDD12',
  title: 'Privacy or Rights Request',
  description: 'Request access, correction, deletion, or help with personal information you have shared with us.',
});

const socialLinks = [
  {
    name: 'TikTok',
    href: 'https://www.tiktok.com/@portraitprompts',
    logo: '/tiktok-logo.svg',
    label: 'Follow on TikTok',
  },
  {
    name: 'Instagram',
    href: 'https://instagram.com/aqprompt_s',
    logo: '/instagram-logo.svg',
    label: 'Follow on Instagram',
  },
  {
    name: 'Facebook',
    href: 'https://www.facebook.com/growthguide.prompts/',
    logo: '/facebook-logo.svg',
    label: 'Follow on Facebook',
  },
  {
    name: 'WhatsApp',
    href: SOCIAL_LINKS.whatsapp,
    logo: '/whatsapp-logo.svg',
    label: 'Join WhatsApp Channel',
  },
];

const contactReasonIcons = {
  'Prompt Request': '\uD83D\uDCDD',
  'Report Issue': '\uD83D\uDC1B',
  'Feature Suggestion': '\uD83D\uDCA1',
  Collaboration: '\uD83E\uDD1D',
  'General Question': '\uD83D\uDCAC',
};

contactReasonIcons['Privacy or Rights Request'] = '\uD83D\uDD12';

const whyChoose = [
  'Free public prompt library for everyone',
  'Editorial review without unsupported testing claims',
  'New prompts added every week',
  'Designed for Instagram and social media creators',
];

const faqs = [
  {
    question: 'How do I request a new prompt?',
    answer:
      'Use the contact form below and select "Prompt Request" as your subject. Tell us what style, category, or AI tool you need prompts for and we will add it to our library.',
  },
  {
    question: 'How long does it take to get a reply?',
    answer:
      'We review messages as soon as practical. Response time depends on the request and current support volume. You can also email hello@aqprompts.com directly.',
  },
  {
    question: 'Can I collaborate with AQPrompts?',
    answer:
      'Yes! We are open to collaborations with AI creators, photographers, and content platforms. Send us your proposal via the contact form.',
  },
  {
    question: 'How do I report a broken or incorrect prompt?',
    answer:
      'Select "Report Issue" in the contact form and describe the problem. We will review the report and correct confirmed issues as soon as practical.',
  },
  {
    question: 'Is AQPrompts free to use?',
    answer:
      'Yes. All prompts in the public AQPrompts library are currently free to browse and copy. VIP membership is paused while we focus on growing the free library.',
  },
];

faqs.push({
  question: 'How do I make a privacy or data-rights request?',
  answer:
    'Select "Privacy or Rights Request" in the form or email hello@aqprompts.com. Explain what you want us to access, correct, or delete. We may ask for limited information to verify that the request relates to you.',
});

const contactPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  name: 'Contact AQPrompts',
  url: `${siteUrl}/contact`,
  description:
    'Contact AQPrompts for prompt requests, feedback, collaboration inquiries, issue reports, and AI prompt support.',
  mainEntity: {
    '@type': 'Organization',
    name: 'AQPrompts',
    url: siteUrl,
    email: contactEmail,
    contactPoint: {
      '@type': 'ContactPoint',
      email: contactEmail,
      contactType: 'customer support',
      availableLanguage: ['English', 'Urdu'],
    },
  },
};

export default function ContactPage() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.subject.trim()) {
      newErrors.subject = 'Subject is required';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Message is required';
    } else if (formData.message.trim().length < 10) {
      newErrors.message = 'Message must be at least 10 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      toast({
        title: 'Validation Error',
        description: 'Please fix the errors below and try again.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          subject: formData.subject.trim(),
          message: formData.message.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send message');
      }

      toast({
        title: 'Message Sent Successfully',
        description: 'Thank you for reaching out. Your message has been received for review.',
      });

      setFormData({ name: '', email: '', subject: '', message: '' });
      setErrors({});
    } catch {
      toast({
        title: 'Submission Failed',
        description: 'There was an error sending your message. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactPageSchema) }}
      />

      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <Header />

        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Contact' }]} />
        </div>

        <main>
          <section className="bg-white py-14 dark:bg-[#0a0a0f] sm:py-20">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-4xl text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Contact</p>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl lg:text-5xl">
                  Contact AQPrompts
                </h1>
                <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-[var(--text-secondary)] sm:text-xl">
                  Have a question, prompt request, or feedback? We would love to hear from you.
                </p>
                <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                  AQPrompts is a digital AI prompt library built for creators, with free public resources for everyone.
                  We are always looking to improve our prompt library and make it more useful for Instagram creators, photographers, and content marketers.
                  Whether you want to request a new prompt category, report a broken prompt, suggest a feature, or just
                  say hello, we are here to help.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-4">
                  <Button asChild size="lg" className="btn-premium rounded-full">
                    <Link href="/tools/ai-image-prompts">
                      Browse AI Prompts <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="btn-premium rounded-full border-primary text-primary hover:bg-primary hover:text-white"
                  >
                    <a href={`mailto:${contactEmail}`}>Email Us</a>
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="py-12 sm:py-16">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-3xl text-center">
                <h2 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
                  What Can We Help With?
                </h2>
                <div className="section-divider" />
                <p className="text-base leading-7 text-[var(--text-secondary)] sm:text-lg">
                  Choose the topic that best matches your message. Clear details help us reply faster and improve the
                  AQPrompts library for everyone.
                </p>
              </div>
              <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
                {contactReasons.map((reason) => (
                  <Card
                    key={reason.title}
                    className="card-premium border-[var(--border)] bg-[var(--bg-card)] text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/60 dark:bg-[#111118]"
                  >
                    <CardHeader>
                      <div className="mb-4 text-4xl" aria-hidden="true">
                        {contactReasonIcons[reason.title]}
                      </div>
                      <CardTitle className="text-lg">{reason.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-6 text-[var(--text-secondary)]">{reason.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-[var(--bg-secondary)] py-12 dark:bg-[#0a0a0f] sm:py-16">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="card-premium border-[var(--border)] bg-[var(--bg-card)] shadow-sm dark:bg-[#111118]">
                  <CardHeader>
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Mail className="h-7 w-7" />
                    </div>
                    <CardTitle className="text-2xl">Email Us</CardTitle>
                    <CardDescription>
                      Send us your prompt requests, feedback, rights concerns, or collaboration inquiries.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild variant="outline" className="rounded-full text-primary hover:bg-primary hover:text-white">
                      <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                    </Button>
                  </CardContent>
                </Card>

                <Card className="card-premium border-[var(--border)] bg-[var(--bg-card)] shadow-sm dark:bg-[#111118]">
                  <CardHeader>
                    <CardTitle className="text-2xl">Connect With Us</CardTitle>
                    <CardDescription>
                      Follow AQPrompts on social platforms for prompt drops, creator tips, and quick support.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      {socialLinks.map((social) => (
                        <Button
                          key={social.name}
                          asChild
                          variant="outline"
                          className="h-auto justify-start gap-3 rounded-xl border-[var(--border)] px-4 py-3 text-[var(--text-primary)] hover:border-primary hover:bg-primary/10"
                        >
                          <Link href={social.href} target="_blank" rel="noopener noreferrer" aria-label={social.label}>
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              <Image
                                src={social.logo}
                                alt={`${social.name} logo`}
                                width={28}
                                height={28}
                                sizes="28px"
                                loading="lazy"
                                placeholder="blur"
                                blurDataURL={BLUR_DATA_URL}
                                unoptimized
                                className="h-7 w-7 object-contain"
                              />
                            </span>
                            <span>{social.name}</span>
                          </Link>
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <section className="py-12 sm:py-16">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-5xl">
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                  <div className="space-y-6">
                    <Card className="card-premium relative overflow-hidden border-t-4 border-t-primary bg-[var(--bg-card)] dark:bg-[#111118]">
                    <CardHeader>
                      <CardTitle className="text-2xl">Send Us a Message</CardTitle>
                      <CardDescription>
                        Fill out the form below and we will get back to you as soon as possible.
                      </CardDescription>
                    </CardHeader>
                    <div aria-hidden="true" className="pointer-events-none absolute -left-6 top-6 hidden md:block">
                      <svg width="260" height="260" viewBox="0 0 260 260" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-20 dark:opacity-10">
                        <defs>
                          <linearGradient id="g1" x1="0" x2="1">
                            <stop offset="0%" stopColor="#ff6b35" stopOpacity="0.16" />
                            <stop offset="100%" stopColor="#ff6b35" stopOpacity="0.04" />
                          </linearGradient>
                        </defs>
                        <rect x="0" y="0" width="260" height="260" rx="20" fill="url(#g1)" />
                        <circle cx="60" cy="70" r="34" fill="#ffd9cc" />
                        <circle cx="170" cy="140" r="52" fill="#ffece6" />
                        <path d="M30 200 C70 160, 120 220, 180 180" stroke="#ff6b35" strokeWidth="6" strokeOpacity="0.08" fill="none" strokeLinecap="round" />
                      </svg>
                    </div>
                    <CardContent>
                      <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                          <Label htmlFor="name">Name *</Label>
                          <Input
                            id="name"
                            name="name"
                            type="text"
                            placeholder="Your name"
                            value={formData.name}
                            onChange={handleChange}
                            className={errors.name ? 'border-red-500 focus-visible:ring-red-500' : 'focus-visible:ring-primary'}
                            disabled={isSubmitting}
                          />
                          {errors.name ? <p className="text-sm text-red-500">{errors.name}</p> : null}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="email">Email *</Label>
                          <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="your@email.com"
                            value={formData.email}
                            onChange={handleChange}
                            className={errors.email ? 'border-red-500 focus-visible:ring-red-500' : 'focus-visible:ring-primary'}
                            disabled={isSubmitting}
                          />
                          {errors.email ? <p className="text-sm text-red-500">{errors.email}</p> : null}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="subject">Subject *</Label>
                          <Input
                            id="subject"
                            name="subject"
                            type="text"
                            placeholder="What is this regarding?"
                            value={formData.subject}
                            onChange={handleChange}
                            className={errors.subject ? 'border-red-500 focus-visible:ring-red-500' : 'focus-visible:ring-primary'}
                            disabled={isSubmitting}
                          />
                          {errors.subject ? <p className="text-sm text-red-500">{errors.subject}</p> : null}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="message">Message *</Label>
                          <Textarea
                            id="message"
                            name="message"
                            placeholder="Tell us about your prompt request, feedback, or question..."
                            value={formData.message}
                            onChange={handleChange}
                            rows={6}
                            className={errors.message ? 'border-red-500 focus-visible:ring-red-500' : 'focus-visible:ring-primary'}
                            disabled={isSubmitting}
                          />
                          {errors.message ? <p className="text-sm text-red-500">{errors.message}</p> : null}
                        </div>

                        <Button type="submit" size="lg" className="btn-premium w-full rounded-full" disabled={isSubmitting}>
                          {isSubmitting ? (
                            <>
                              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Send className="mr-2 h-5 w-5" />
                              Send Message
                            </>
                          )}
                        </Button>
                      </form>
                    </CardContent>
                    </Card>

                  </div>

                  <div className="space-y-6">
                    <Card className="card-premium border-[var(--border)] bg-[var(--bg-card)] shadow-sm dark:bg-[#111118]">
                      <CardHeader>
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white">
                          <Clock className="h-6 w-6" />
                        </div>
                        <CardTitle className="text-xl">Business Hours</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3 text-[var(--text-secondary)]">
                          <p><strong>Monday - Friday:</strong> 9:00 AM - 6:00 PM PKT</p>
                          <p><strong>Saturday - Sunday:</strong> Closed</p>
                          <p className="pt-2 text-sm">We reply within 24-48 hours.</p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="card-premium border-[var(--border)] bg-[var(--bg-card)] shadow-sm dark:bg-[#111118]">
                      <CardHeader>
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white">
                          <Users className="h-6 w-6" />
                        </div>
                        <CardTitle className="text-xl">Why Choose AQPrompts?</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {whyChoose.map((item) => (
                            <div key={item} className="flex gap-3 text-[var(--text-secondary)]">
                              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                  </div>

                  <Card className="card-premium border-[var(--border)] bg-[var(--bg-card)] shadow-sm dark:bg-[#111118] lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-xl">How We Use Your Feedback</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="leading-7 text-[var(--text-secondary)]">
                        Your messages help us decide which prompt categories to publish next, which AI tools to test,
                        and which creator workflows need clearer examples. We read every useful request and use that
                        feedback to make AQPrompts better for beginners, professionals, and social media teams. We
                        also use this form to receive privacy and data-rights requests. Please avoid sending passwords,
                        payment-card details, or other unnecessary sensitive information.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-[var(--bg-secondary)] py-12 dark:bg-[#0a0a0f] sm:py-16">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-4xl">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
                    Common Questions
                  </h2>
                  <div className="section-divider" />
                  <p className="text-base leading-7 text-[var(--text-secondary)] sm:text-lg">
                    These answers cover the most common contact requests we receive from AI creators, photographers,
                    marketers, and social media creators.
                  </p>
                </div>

                <div className="mt-10 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_18px_60px_rgba(15,23,42,0.07)] dark:bg-[#111118]">
                  {faqs.map((faq) => (
                    <details key={faq.question} className="group border-b border-[var(--border)] last:border-b-0">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-left font-black text-[var(--text-primary)] transition hover:bg-primary/5 hover:text-primary [&::-webkit-details-marker]:hidden">
                        <span className="flex min-w-0 items-start gap-3">
                          <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                          <span>{faq.question}</span>
                        </span>
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-lg leading-none text-primary transition-transform group-open:rotate-45 dark:bg-[#0a0a0f]" aria-hidden="true">+</span>
                      </summary>
                      <p className="px-5 pb-5 pl-12 leading-7 text-[var(--text-secondary)] sm:pl-[3.25rem]">{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
